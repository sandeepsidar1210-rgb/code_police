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
 * The engine is intentionally dependency-free and language-aware. It resolves
 * imports against the repo file tree so it works without a package manager or a
 * checked-out workspace. Supported import grammars:
 *   - JS/TS ecosystem (.ts/.tsx/.js/.jsx/.mjs/.cjs): relative + path-alias
 *     imports, directory index files.
 *   - Python (.py/.pyi): absolute dotted imports and relative imports
 *     (`from . import x`, `from ..pkg.mod import y`), resolving to module files
 *     and package `__init__` files.
 * Other languages are skipped gracefully (no edges, never throws).
 */

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_FILES = JS_TS_EXTENSIONS.map((ext) => `index${ext}`);

const PY_EXTENSIONS = [".py", ".pyi"];

const GO_EXTENSIONS = [".go"];

/** Every source extension whose imports this engine can parse. */
export const SOURCE_EXTENSIONS = [...JS_TS_EXTENSIONS, ...PY_EXTENSIONS, ...GO_EXTENSIONS];

export type SourceLanguage = "js" | "py" | "go";

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

/**
 * Detect which import grammar applies to a file, or null if the engine has no
 * parser for it. Note: this is distinct from `analyzer.detectLanguage`, which
 * returns human language names for the AI reviewer; this returns the internal
 * parser bucket used by the dependency graph.
 */
export function detectSourceLanguage(path: string): SourceLanguage | null {
  if (JS_TS_EXTENSIONS.some((ext) => path.endsWith(ext))) return "js";
  if (PY_EXTENSIONS.some((ext) => path.endsWith(ext))) return "py";
  if (GO_EXTENSIONS.some((ext) => path.endsWith(ext))) return "go";
  return null;
}

/** Strip quoted import specifiers from a line of JS/TS source. */
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
 * Resolve a JS/TS import specifier (e.g. "./utils", "@/lib/x") to an actual
 * file path that exists in the provided file set.
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

/** Parent directory of a repo path ("a/b/c.py" -> "a/b", "x.py" -> ""). */
function dirOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

// ---------------------------------------------------------------------------
// Python import support
// ---------------------------------------------------------------------------

export interface PythonImport {
  /** Dotted module, e.g. "pkg.sub" (empty string for `from . import x`). */
  module: string;
  /** Number of leading dots (0 = absolute import, >=1 = relative). */
  level: number;
  /** Imported names (for `from X import a, b`); [] for a plain `import`. */
  names: string[];
}

/**
 * Extract Python imports from source. Best-effort and regex-based, mirroring
 * the JS extractor's approach (it does not strip strings/comments out, and a
 * multi-line parenthesized `from X import (...)` still captures the module X
 * correctly even if the individual names span lines).
 */
/**
 * Collapse line-continuations in import statements so multi-line parenthesized
 * `from X import (a, b, c)` blocks and backslash-continued imports are parsed
 * as a single logical line. Only import statements are joined; every other
 * source line passes through unchanged.
 */
function joinImportContinuations(source: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  let buf: string | null = null;
  let parenDepth = 0;

  const netParens = (s: string) =>
    (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;

  for (const line of lines) {
    if (buf === null) {
      const isImportStmt = /^[ \t]*(from[ \t].*[ \t]import|import)[ \t]/.test(line);
      const depth = netParens(line);
      const backslash = /\\[ \t]*$/.test(line);
      if (isImportStmt && (depth > 0 || backslash)) {
        buf = line.replace(/\\[ \t]*$/, " ");
        parenDepth = Math.max(0, depth);
        continue;
      }
      out.push(line);
    } else {
      parenDepth += netParens(line);
      const backslash = /\\[ \t]*$/.test(line);
      buf += " " + line.replace(/\\[ \t]*$/, " ");
      if (parenDepth <= 0 && !backslash) {
        out.push(buf);
        buf = null;
        parenDepth = 0;
      }
    }
  }
  if (buf !== null) out.push(buf);
  return out.join("\n");
}

export function extractPythonImports(source: string): PythonImport[] {
  const imports: PythonImport[] = [];
  const text = joinImportContinuations(source);

  // `from [dots][module] import names`
  const fromRe = /^[ \t]*from[ \t]+(\.*)([A-Za-z0-9_.]*)[ \t]+import[ \t]+(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(text)) !== null) {
    const level = m[1].length;
    const moduleName = m[2] ?? "";
    if (level === 0 && moduleName === "") continue; // `from  import x` is invalid
    imports.push({ module: moduleName, level, names: parseImportedNames(m[3] ?? "") });
  }

  // `import a.b, c as d`
  const importRe = /^[ \t]*import[ \t]+(.+)$/gm;
  while ((m = importRe.exec(text)) !== null) {
    let clause = m[1];
    const hash = clause.indexOf("#");
    if (hash >= 0) clause = clause.slice(0, hash);
    for (const part of clause.split(",")) {
      const mod = part.trim().split(/[ \t]+as[ \t]+/)[0].trim();
      if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(mod)) {
        imports.push({ module: mod, level: 0, names: [] });
      }
    }
  }

  return imports;
}

function parseImportedNames(raw: string): string[] {
  let s = raw.trim();
  const hash = s.indexOf("#");
  if (hash >= 0) s = s.slice(0, hash);
  s = s.replace(/[()\\]/g, " ");
  if (/\*/.test(s)) return ["*"];
  return s
    .split(",")
    .map((n) => n.trim().split(/[ \t]+as[ \t]+/)[0].trim())
    .filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n));
}

/** Try to resolve a no-extension Python path to a module file or package init. */
function tryPyTarget(basePath: string, fileSet: Set<string>): string | null {
  if (basePath !== "" && fileSet.has(basePath)) return basePath;
  for (const ext of PY_EXTENSIONS) {
    if (basePath !== "" && fileSet.has(basePath + ext)) return basePath + ext;
  }
  for (const ext of PY_EXTENSIONS) {
    const init = basePath ? `${basePath}/__init__${ext}` : `__init__${ext}`;
    if (fileSet.has(init)) return init;
  }
  return null;
}

/**
 * Resolve a single Python import to the repo file(s) it references. Returns
 * possibly several paths (e.g. `from pkg import a, b` may map to submodules
 * `pkg/a.py` and `pkg/b.py`, plus the package `__init__`).
 *
 * @param sourceRoots base dirs to try for absolute imports. Defaults to the
 *        repo root and a `src/` layout, which covers the vast majority of repos.
 */
export function resolvePythonImport(
  fromFile: string,
  imp: PythonImport,
  fileSet: Set<string>,
  sourceRoots: string[] = ["", "src"]
): string[] {
  const results = new Set<string>();
  const moduleParts = imp.module ? imp.module.split(".").filter(Boolean) : [];

  let baseDirs: string[];
  if (imp.level > 0) {
    // Relative import. One dot = the package directory containing `fromFile`.
    // Reject imports that climb above the project root — Python raises
    // ImportError ("attempted relative import beyond top-level package") there,
    // so resolving against the root would only produce spurious edges.
    const dir = dirOf(fromFile);
    // Compute Python package depth relative to the deepest matching source root,
    // so `src/pkg/sub/mod.py` has depth 2 (pkg/sub), not 3 (src/pkg/sub).
    // Without this, src-layout files permit one extra relative-import level that
    // Python would reject with ImportError.
    const matchingRoot = sourceRoots
      .filter((r) => r === "" || dir === r || dir.startsWith(r + "/"))
      .reduce((best, r) => (r.length > best.length ? r : best), "");
    const rootDepth = matchingRoot ? matchingRoot.split("/").length : 0;
    const availableDepth = (dir === "" ? 0 : dir.split("/").length) - rootDepth;
    if (imp.level - 1 > availableDepth) return [];

    let base = dir;
    for (let i = 1; i < imp.level; i++) base = dirOf(base);
    baseDirs = [base];
  } else {
    baseDirs = sourceRoots;
  }

  for (const baseDir of baseDirs) {
    const modPath = [baseDir, ...moduleParts].filter((s) => s !== "").join("/");
    const moduleFile = tryPyTarget(modPath, fileSet);
    if (moduleFile) {
      results.add(moduleFile);
      // Importing `a.b.c` also executes intermediate package __init__ files
      // (`a/__init__.py`, `a/b/__init__.py`). Only add these edges when the
      // module was actually resolved in this source root — an unresolved root
      // must not contribute false initializer edges from the wrong directory.
      let acc = baseDir;
      for (let i = 0; i < moduleParts.length - 1; i++) {
        acc = [acc, moduleParts[i]].filter((s) => s !== "").join("/");
        for (const ext of PY_EXTENSIONS) {
          const init = acc ? `${acc}/__init__${ext}` : `__init__${ext}`;
          if (fileSet.has(init)) results.add(init);
        }
      }
    }

    // `from X import name` — a name may itself be a submodule (X/name.py).
    for (const name of imp.names) {
      if (name === "*") continue;
      const subPath = [modPath, name].filter((s) => s !== "").join("/");
      const subFile = tryPyTarget(subPath, fileSet);
      if (subFile) results.add(subFile);
    }
  }

  return [...results];
}

// ---------------------------------------------------------------------------
// Go import support
// ---------------------------------------------------------------------------

/** Remove Go block and line comments so commented-out or paren-bearing
 *  comments don't corrupt import parsing. Not string-aware (consistent with
 *  the other best-effort extractors); import paths never contain `//`. */
function stripGoComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * Extract the imported package paths from Go source. Handles single-line
 * imports (`import "fmt"`, `import alias "path"`, `import _ "path"`,
 * `import . "path"`) and grouped blocks (`import ( ... )`). Only the quoted
 * import path is captured; the alias/blank/dot qualifier is irrelevant to the
 * dependency edge (it still pulls in the package).
 */
export function extractGoImports(source: string): string[] {
  const text = stripGoComments(source);
  const paths: string[] = [];
  const specRe = /(?:[A-Za-z_]\w*\s+|_\s+|\.\s+)?"([^"]+)"/g;

  // Grouped: import ( ... )
  const groupRe = /\bimport\s*\(([\s\S]*?)\)/g;
  let gm: RegExpExecArray | null;
  while ((gm = groupRe.exec(text)) !== null) {
    const block = gm[1];
    specRe.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = specRe.exec(block)) !== null) paths.push(sm[1]);
  }

  // Single-line: import [alias|_|.] "path"
  const singleRe = /\bimport\s+(?:[A-Za-z_]\w*\s+|_\s+|\.\s+)?"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = singleRe.exec(text)) !== null) paths.push(m[1]);

  return paths;
}

/** Map each repo directory containing non-test `.go` files to those files. */
function collectGoPackageDirs(fileSet: Set<string>): Map<string, string[]> {
  const dirs = new Map<string, string[]>();
  for (const path of fileSet) {
    if (!path.endsWith(".go") || path.endsWith("_test.go")) continue;
    const dir = dirOf(path);
    const list = dirs.get(dir);
    if (list) list.push(path);
    else dirs.set(dir, [path]);
  }
  return dirs;
}

/** Parse the `module` path from a go.mod file in the set, if one is present. */
function parseGoModulePath(files: Array<{ path: string; content: string }>): string | undefined {
  const mod = files.find((f) => f.path === "go.mod" || f.path.endsWith("/go.mod"));
  if (!mod) return undefined;
  const m = /^\s*module\s+(\S+)/m.exec(mod.content);
  return m ? m[1] : undefined;
}

/**
 * Resolve a Go import path to the repo files it references. Go imports a
 * *package* (a directory), so the edge points at every non-test `.go` file in
 * that package directory.
 *
 * The in-repo package directory is always a trailing segment of the full
 * import path — the module-path prefix declared in go.mod maps to the repo
 * root. So we match the longest known package directory that is a suffix of
 * the import path. When `modulePath` is supplied and the import falls under it,
 * the prefix is stripped directly for an exact, unambiguous match. Standard
 * library and external imports resolve to nothing (no repo directory matches).
 */
export function resolveGoImport(
  importPath: string,
  goDirs: Map<string, string[]>,
  modulePath?: string
): string[] {
  if (modulePath && (importPath === modulePath || importPath.startsWith(modulePath + "/"))) {
    const rel = importPath === modulePath ? "" : importPath.slice(modulePath.length + 1);
    return goDirs.get(rel) ?? [];
  }

  let best: string | null = null;
  for (const dir of goDirs.keys()) {
    if (dir === "") continue;
    if (importPath === dir || importPath.endsWith("/" + dir)) {
      if (best === null || dir.length > best.length) best = dir;
    }
  }
  return best !== null ? goDirs.get(best) ?? [] : [];
}

/**
 * Build a dependency graph from a list of files and their contents.
 *
 * @param files        array of { path, content } for every analyzable file
 * @param aliasRoots   optional JS/TS path-alias map (defaults to "@/" -> "src/")
 * @param pythonRoots  optional base dirs for resolving absolute Python imports
 */
export function buildDependencyGraph(
  files: Array<{ path: string; content: string }>,
  aliasRoots: Record<string, string> = { "@/": "src/" },
  pythonRoots: string[] = ["", "src"]
): DependencyGraph {
  const fileSet = new Set(files.map((f) => f.path));
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();

  // Precompute Go package directories and module path once for the whole graph.
  const goDirs = collectGoPackageDirs(fileSet);
  const goModulePath = parseGoModulePath(files);

  for (const path of fileSet) {
    imports.set(path, new Set());
    importedBy.set(path, new Set());
  }

  for (const file of files) {
    const lang = detectSourceLanguage(file.path);
    if (!lang) continue;

    const resolvedPaths: string[] = [];
    if (lang === "js") {
      for (const spec of extractSpecifiers(file.content)) {
        const resolved = resolveSpecifier(file.path, spec, fileSet, aliasRoots);
        if (resolved) resolvedPaths.push(resolved);
      }
    } else if (lang === "py") {
      for (const imp of extractPythonImports(file.content)) {
        for (const resolved of resolvePythonImport(file.path, imp, fileSet, pythonRoots)) {
          resolvedPaths.push(resolved);
        }
      }
    } else if (lang === "go") {
      for (const spec of extractGoImports(file.content)) {
        for (const resolved of resolveGoImport(spec, goDirs, goModulePath)) {
          resolvedPaths.push(resolved);
        }
      }
    }

    for (const resolved of resolvedPaths) {
      if (resolved && resolved !== file.path) {
        imports.get(file.path)!.add(resolved);
        importedBy.get(resolved)!.add(file.path);
      }
    }
  }

  return { nodes: [...fileSet], imports, importedBy };
}

/** @deprecated use {@link detectSourceLanguage}. Retained for compatibility. */
export function isJsTsFile(path: string): boolean {
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

// ---------------------------------------------------------------------------
// Cyclic dependency detection
// ---------------------------------------------------------------------------

/**
 * Detect circular import chains in the dependency graph.
 *
 * Uses a depth-first search with a recursion stack ("white/gray/black"
 * colouring): when a node currently on the stack is reached again, the slice of
 * the stack from that node forms a cycle. Each distinct cycle is reported once
 * (rotations are de-duplicated) as an ordered list of file paths `[a, b, c]`
 * meaning `a → b → c → a`.
 *
 * This reports a representative cycle for each circular structure it encounters
 * rather than enumerating every elementary cycle (which is exponential in the
 * worst case) — the right granularity for flagging circular dependencies to a
 * maintainer. Results are deterministically ordered and capped at `maxCycles`.
 * Traversal is bounded by the graph size (the PR-impact path caps the tree), so
 * recursion depth stays well within limits.
 */
export function detectCycles(graph: DependencyGraph, maxCycles = 50): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.nodes) color.set(node, WHITE);

  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const neighborsOf = (node: string): string[] =>
    [...(graph.imports.get(node) ?? new Set<string>())].sort();

  const normalize = (cycle: string[]): string => {
    let min = 0;
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < cycle[min]) min = i;
    }
    return [...cycle.slice(min), ...cycle.slice(0, min)].join("|");
  };

  function visit(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    onStack.add(node);

    for (const next of neighborsOf(node)) {
      if (cycles.length >= maxCycles) break;
      if (onStack.has(next)) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = normalize(cycle);
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (color.get(next) === WHITE) {
        visit(next);
      }
    }

    stack.pop();
    onStack.delete(node);
    color.set(node, BLACK);
  }

  for (const node of [...graph.nodes].sort()) {
    if (cycles.length >= maxCycles) break;
    if (color.get(node) === WHITE) visit(node);
  }

  cycles.sort((a, b) => a.length - b.length || normalize(a).localeCompare(normalize(b)));
  return cycles;
}

/**
 * Render detected cycles as a Markdown section for a PR comment. Returns an
 * empty string when there are no cycles, so callers can append it
 * unconditionally without producing an empty heading.
 */
export function formatCyclesComment(cycles: string[][]): string {
  if (cycles.length === 0) return "";

  const short = (p: string) => p.split("/").slice(-2).join("/");
  const lines = cycles.slice(0, 15).map((cycle) => {
    const loop = [...cycle, cycle[0]].map(short).join(" → ");
    return `- \`${loop}\``;
  });
  const more = cycles.length > 15 ? `\n_…and ${cycles.length - 15} more._` : "";

  return [
    "## 🔄 Circular Dependencies",
    "",
    `⚠️ **${cycles.length}** circular import ${cycles.length === 1 ? "chain" : "chains"} detected. ` +
      "Circular imports can cause initialization-order bugs and make modules harder to test in isolation.",
    "",
    ...lines,
    more,
  ].join("\n");
}
