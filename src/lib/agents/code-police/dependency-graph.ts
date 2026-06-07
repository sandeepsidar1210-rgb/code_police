/**
 * ============================================================================
 * CODE POLICE - DEPENDENCY GRAPH ENGINE
 * ============================================================================
 * Builds a real, import-based dependency graph from a repository tree and
 * computes the "blast radius" of a Pull Request: given the set of changed
 * files, determine which other files transitively depend on them and are
 * therefore *affected* by the change.
 *
 * This powers the OSS-maintainer experience: instead of guessing, a maintainer
 * can instantly see "this PR changes A and B, which affects C, D, E".
 *
 * The engine is intentionally dependency-free and language-aware for the
 * JS/TS ecosystem (the most common case), with graceful handling for other
 * languages. It resolves relative imports against the repo file tree so it
 * works without a package manager or a checked-out workspace.
 */

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_FILES = JS_TS_EXTENSIONS.map((ext) => `index${ext}`);

/** A single edge: `from` imports `to`. */
export interface DependencyEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  /** All file paths known to the graph. */
  nodes: string[];
  /** importer -> Set of files it imports (resolved repo paths). */
  imports: Map<string, Set<string>>;
  /** imported -> Set of files that import it (reverse edges). */
  importedBy: Map<string, Set<string>>;
}

export interface FileImpact {
  path: string;
  /** Shortest dependency distance from a changed file (1 = direct importer). */
  depth: number;
}

export interface PrImpactReport {
  changedFiles: string[];
  /** Files transitively affected by the change, ordered by closeness. */
  affectedFiles: FileImpact[];
  /** Direct importers of the changed files (depth === 1). */
  directDependents: string[];
  /** A compact, deterministic edge list for rendering a graph in the UI. */
  edges: DependencyEdge[];
  /** Heuristic risk score 0-100 based on blast radius and fan-out. */
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

/** Strip a quoted import specifier from a line of source. */
function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  // ES module imports/exports: import ... from '...'; export ... from '...'
  const importFrom = /\b(?:import|export)\b[^;\n]*?\bfrom\s+["']([^"']+)["']/g;
  // Bare side-effect imports: import '...'
  const bareImport = /\bimport\s+["']([^"']+)["']/g;
  // Dynamic import('...') and require('...')
  const dynamic = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const re of [importFrom, bareImport, dynamic]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/**
 * Resolve an import specifier (e.g. "./utils", "@/lib/x") to an actual file
 * path that exists in the provided file set.
 *
 * @param fromFile     the importing file's repo path
 * @param specifier    the raw import string
 * @param fileSet      a Set of every file path in the repo (for existence checks)
 * @param aliasRoots   map of path-alias prefix -> base dir (e.g. "@/" -> "src/")
 */
export function resolveSpecifier(
  fromFile: string,
  specifier: string,
  fileSet: Set<string>,
  aliasRoots: Record<string, string>
): string | null {
  // Ignore bare package imports (node_modules) – they are not repo files.
  const isRelative = specifier.startsWith(".");
  const aliasPrefix = Object.keys(aliasRoots).find((p) => specifier.startsWith(p));

  let basePath: string;
  if (isRelative) {
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    basePath = normalizePath(joinPath(fromDir, specifier));
  } else if (aliasPrefix) {
    const rest = specifier.slice(aliasPrefix.length);
    basePath = normalizePath(joinPath(aliasRoots[aliasPrefix], rest));
  } else {
    return null; // external package
  }

  // 1. Exact match
  if (fileSet.has(basePath)) return basePath;

  // 2. Append known extensions
  for (const ext of JS_TS_EXTENSIONS) {
    if (fileSet.has(basePath + ext)) return basePath + ext;
  }

  // 3. Directory index files
  for (const index of INDEX_FILES) {
    const candidate = basePath.endsWith("/") ? basePath + index : `${basePath}/${index}`;
    if (fileSet.has(candidate)) return candidate;
  }

  return null;
}

function joinPath(a: string, b: string): string {
  if (!a) return b;
  return `${a}/${b}`;
}

/** Normalize a path: collapse "./" and "../" segments. */
function normalizePath(path: string): string {
  const segments = path.split("/");
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      stack.pop();
    } else {
      stack.push(seg);
    }
  }
  return stack.join("/");
}

/**
 * Build a dependency graph from a list of files and their contents.
 *
 * @param files     array of { path, content } for every analyzable file
 * @param aliasRoots optional path-alias map (defaults to common Next.js "@/" -> "src/")
 */
export function buildDependencyGraph(
  files: Array<{ path: string; content: string }>,
  aliasRoots: Record<string, string> = { "@/": "src/" }
): DependencyGraph {
  const fileSet = new Set(files.map((f) => f.path));
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();

  for (const path of fileSet) {
    imports.set(path, new Set());
    importedBy.set(path, new Set());
  }

  for (const file of files) {
    if (!isJsTsFile(file.path)) continue;
    const specifiers = extractSpecifiers(file.content);
    for (const spec of specifiers) {
      const resolved = resolveSpecifier(file.path, spec, fileSet, aliasRoots);
      if (resolved && resolved !== file.path) {
        imports.get(file.path)!.add(resolved);
        importedBy.get(resolved)!.add(file.path);
      }
    }
  }

  return { nodes: [...fileSet], imports, importedBy };
}

function isJsTsFile(path: string): boolean {
  return JS_TS_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Compute the PR impact ("blast radius") for a set of changed files using a
 * breadth-first traversal over the reverse-dependency edges.
 *
 * @param maxDepth limit traversal depth to keep reports readable (default 4)
 */
export function computePrImpact(
  graph: DependencyGraph,
  changedFiles: string[],
  maxDepth = 4
): PrImpactReport {
  const changed = changedFiles.filter((f) => graph.importedBy.has(f));
  const depthByFile = new Map<string, number>();
  const edges: DependencyEdge[] = [];
  const seenEdge = new Set<string>();

  // BFS outward over reverse edges (who imports me?).
  let frontier = new Set(changed);
  let depth = 0;
  while (frontier.size > 0 && depth < maxDepth) {
    depth += 1;
    const next = new Set<string>();
    for (const file of frontier) {
      const dependents = graph.importedBy.get(file) ?? new Set();
      for (const dependent of dependents) {
        const edgeKey = `${dependent}->${file}`;
        if (!seenEdge.has(edgeKey)) {
          seenEdge.add(edgeKey);
          edges.push({ from: dependent, to: file });
        }
        if (!depthByFile.has(dependent) && !changedFiles.includes(dependent)) {
          depthByFile.set(dependent, depth);
          next.add(dependent);
        }
      }
    }
    frontier = next;
  }

  const affectedFiles: FileImpact[] = [...depthByFile.entries()]
    .map(([path, d]) => ({ path, depth: d }))
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));

  const directDependents = affectedFiles.filter((f) => f.depth === 1).map((f) => f.path);

  const { riskScore, riskLevel } = scoreRisk(changed.length, affectedFiles, directDependents.length);

  return {
    changedFiles,
    affectedFiles,
    directDependents,
    edges,
    riskScore,
    riskLevel,
  };
}

/**
 * Heuristic risk score. A change that ripples into many files, especially many
 * *direct* dependents, is riskier and deserves closer review.
 */
function scoreRisk(
  changedCount: number,
  affected: FileImpact[],
  directCount: number
): { riskScore: number; riskLevel: PrImpactReport["riskLevel"] } {
  const totalAffected = affected.length;
  // Weighted: direct dependents matter more than distant ones.
  const weighted = directCount * 4 + Math.max(0, totalAffected - directCount) * 1.5;
  const raw = weighted + changedCount * 2;
  const riskScore = Math.min(100, Math.round(raw));

  let riskLevel: PrImpactReport["riskLevel"];
  if (riskScore >= 70) riskLevel = "critical";
  else if (riskScore >= 40) riskLevel = "high";
  else if (riskScore >= 15) riskLevel = "medium";
  else riskLevel = "low";

  return { riskScore, riskLevel };
}

/**
 * Render the impact report as a Markdown block suitable for a PR comment.
 * Uses a Mermaid graph so GitHub/GitLab render an actual diagram, plus a
 * terminal-styled summary table.
 */
export function formatImpactComment(report: PrImpactReport): string {
  const riskEmoji = {
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    critical: "🔴",
  }[report.riskLevel];

  if (report.affectedFiles.length === 0) {
    return [
      "## 🕸️ Dependency Impact",
      "",
      `${riskEmoji} **Risk: ${report.riskLevel.toUpperCase()}** (score ${report.riskScore}/100)`,
      "",
      "No other tracked files import the changed files. This change is **self-contained**.",
    ].join("\n");
  }

  const topAffected = report.affectedFiles.slice(0, 15);
  const table = [
    "| Affected file | Distance |",
    "| --- | --- |",
    ...topAffected.map((f) => `| \`${f.path}\` | ${f.depth === 1 ? "direct" : `${f.depth} hops`} |`),
  ].join("\n");

  const mermaid = buildMermaid(report);

  return [
    "## 🕸️ Dependency Impact",
    "",
    `${riskEmoji} **Risk: ${report.riskLevel.toUpperCase()}** (score ${report.riskScore}/100)`,
    "",
    `This PR changes **${report.changedFiles.length}** file(s), which affects ` +
      `**${report.affectedFiles.length}** other file(s) ` +
      `(**${report.directDependents.length}** directly).`,
    "",
    "```mermaid",
    mermaid,
    "```",
    "",
    "<details><summary>Affected files</summary>",
    "",
    table,
    report.affectedFiles.length > topAffected.length
      ? `\n_…and ${report.affectedFiles.length - topAffected.length} more._`
      : "",
    "",
    "</details>",
  ].join("\n");
}

/** Build a compact Mermaid `graph LR` definition from the edge list. */
function buildMermaid(report: PrImpactReport): string {
  const short = (p: string) => p.split("/").slice(-2).join("/");
  const id = (() => {
    const map = new Map<string, string>();
    let counter = 0;
    return (p: string) => {
      if (!map.has(p)) map.set(p, `n${counter++}`);
      return map.get(p)!;
    };
  })();

  const changedSet = new Set(report.changedFiles);
  const lines = ["graph LR"];
  // Limit edges so the diagram stays legible.
  for (const edge of report.edges.slice(0, 30)) {
    lines.push(`  ${id(edge.from)}["${short(edge.from)}"] --> ${id(edge.to)}["${short(edge.to)}"]`);
  }
  // Highlight changed nodes.
  for (const changed of changedSet) {
    lines.push(`  style ${id(changed)} fill:#f97316,stroke:#fff,color:#fff`);
  }
  return lines.join("\n");
}
