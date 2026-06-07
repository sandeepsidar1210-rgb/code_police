/**
 * ============================================================================
 * CODE POLICE - MERGE CONFLICT PRE-DETECTOR
 * ============================================================================
 * Surfaces likely merge conflicts *before* a maintainer attempts the merge.
 *
 * Strategy (no local checkout required, works purely over the GitHub API):
 *  1. Read the PR's mergeable state directly from GitHub when available.
 *  2. Independently compute "overlap risk": files changed by the PR that have
 *     ALSO changed on the base branch since the PR's merge-base. Overlapping
 *     line ranges are the strongest predictor of a textual conflict.
 *  3. Produce a maintainer-friendly, terminal-styled report and an optional
 *     AI-assisted resolution suggestion.
 *
 * This dramatically reduces the DevOps burden of "merge, see it break, undo".
 */

const GITHUB_API_BASE = "https://api.github.com";

export interface ConflictFile {
  path: string;
  /** Line ranges touched by the PR head. */
  prRanges: Array<[number, number]>;
  /** Line ranges touched on the base branch since merge-base. */
  baseRanges: Array<[number, number]>;
  /** True when PR and base edits touch overlapping line ranges. */
  overlapping: boolean;
}

export interface ConflictReport {
  /** GitHub's own assessment: true, false, or null (still computing). */
  mergeable: boolean | null;
  mergeableState?: string;
  /** Files both sides touched (potential conflicts). */
  contestedFiles: ConflictFile[];
  /** Subset of contestedFiles with overlapping line ranges (likely conflicts). */
  likelyConflicts: ConflictFile[];
  riskLevel: "none" | "low" | "high";
  summary: string;
}

interface GitHubFile {
  filename: string;
  status: string;
  patch?: string;
}

async function ghJson<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

/**
 * Parse a unified-diff patch into the set of line ranges it modifies on the
 * "new" side of the file (the `+` hunks).
 */
export function parsePatchRanges(patch?: string): Array<[number, number]> {
  if (!patch) return [];
  const ranges: Array<[number, number]> = [];
  const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;
  while ((match = hunkHeader.exec(patch)) !== null) {
    const start = parseInt(match[1], 10);
    const count = match[2] ? parseInt(match[2], 10) : 1;
    if (count > 0) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

function rangesOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (const [aStart, aEnd] of a) {
    for (const [bStart, bEnd] of b) {
      if (aStart <= bEnd && bStart <= aEnd) return true;
    }
  }
  return false;
}

/**
 * Detect likely conflicts for a pull request.
 *
 * @param token   GitHub access token
 * @param owner   repo owner
 * @param repo    repo name
 * @param prNumber pull request number
 * @param baseRef base branch name (e.g. "main")
 * @param headRef head branch name
 */
export async function detectConflicts(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  baseRef: string,
  headRef: string
): Promise<ConflictReport> {
  // 1. Ask GitHub directly. `mergeable` may be null while GitHub computes it.
  const pr = await ghJson<{ mergeable: boolean | null; mergeable_state: string }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`,
    token
  );

  // 2. Files changed by the PR (head side).
  const prFiles =
    (await ghJson<GitHubFile[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
      token
    )) ?? [];

  // 3. What changed on base since the merge-base of head and base.
  //    `compare/base...head` reports commits unique to head; we instead want
  //    base changes the PR doesn't know about, so compare head...base.
  const baseComparison = await ghJson<{ files?: GitHubFile[] }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${encodeURIComponent(headRef)}...${encodeURIComponent(baseRef)}`,
    token
  );
  const baseFiles = baseComparison?.files ?? [];

  const prByPath = new Map(prFiles.map((f) => [f.filename, f]));
  const baseByPath = new Map(baseFiles.map((f) => [f.filename, f]));

  const contestedFiles: ConflictFile[] = [];
  for (const [path, prFile] of prByPath) {
    const baseFile = baseByPath.get(path);
    if (!baseFile) continue; // only one side touched it
    const prRanges = parsePatchRanges(prFile.patch);
    const baseRanges = parsePatchRanges(baseFile.patch);
    const overlapping = rangesOverlap(prRanges, baseRanges);
    contestedFiles.push({ path, prRanges, baseRanges, overlapping });
  }

  const likelyConflicts = contestedFiles.filter((f) => f.overlapping);

  let riskLevel: ConflictReport["riskLevel"] = "none";
  if (pr?.mergeable === false || likelyConflicts.length > 0) riskLevel = "high";
  else if (contestedFiles.length > 0) riskLevel = "low";

  const summary = buildSummary(pr?.mergeable ?? null, contestedFiles, likelyConflicts);

  return {
    mergeable: pr?.mergeable ?? null,
    mergeableState: pr?.mergeable_state,
    contestedFiles,
    likelyConflicts,
    riskLevel,
    summary,
  };
}

function buildSummary(
  mergeable: boolean | null,
  contested: ConflictFile[],
  likely: ConflictFile[]
): string {
  if (mergeable === false) {
    return `GitHub reports this PR is NOT mergeable. ${likely.length} file(s) have overlapping edits.`;
  }
  if (likely.length > 0) {
    return `${likely.length} file(s) have overlapping edits on both branches — manual review recommended.`;
  }
  if (contested.length > 0) {
    return `${contested.length} file(s) changed on both branches, but in different regions. Likely auto-mergeable.`;
  }
  return "No competing changes detected. This PR should merge cleanly.";
}

/**
 * Render a conflict report as a Markdown PR comment with a terminal aesthetic.
 */
export function formatConflictComment(report: ConflictReport): string {
  const icon = { none: "🟢", low: "🟡", high: "🔴" }[report.riskLevel];
  const lines = [
    "## 🔀 Merge Conflict Pre-Check",
    "",
    `${icon} **${report.riskLevel === "none" ? "CLEAN" : report.riskLevel.toUpperCase()}** — ${report.summary}`,
  ];

  if (report.likelyConflicts.length > 0) {
    lines.push("", "```diff");
    for (const f of report.likelyConflicts.slice(0, 10)) {
      lines.push(`! ${f.path}`);
    }
    lines.push("```");
    lines.push("", "_These files were edited in the same regions on both branches._");
  }

  return lines.join("\n");
}
