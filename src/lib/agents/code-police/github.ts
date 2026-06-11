/**
 * ============================================================================
 * CODE POLICE - GITHUB SERVICE
 * ============================================================================
 * GitHub API integration for fetching file contents and webhook management.
 */

import type { GitHubRepo } from "@/types";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * ----------------------------------------------------------------------------
 * Rate-limit-aware fetch wrapper
 * ----------------------------------------------------------------------------
 * Every GitHub call in this module goes through githubFetch so that transient
 * failures are handled in one place instead of per call site:
 *
 *  - 429, and 403 with `x-ratelimit-remaining: 0`, are treated as rate limits.
 *    The wait honors `Retry-After` (seconds) or `x-ratelimit-reset` (epoch),
 *    capped by maxDelayMs.
 *  - 5xx and network/transport errors get capped exponential backoff with
 *    jitter.
 *  - If a rate-limit reset is further out than the retry budget, a typed
 *    GitHubRateLimitError is thrown immediately so callers can degrade rather
 *    than block (important in a serverless context).
 *  - Any other response (2xx/3xx/404/401/422/plain 403) is returned unchanged,
 *    so each caller's existing `!response.ok` handling behaves exactly as before.
 *
 * The three numeric knobs default sensibly, can be overridden per call via
 * `options`, and also fall back to env vars for deployment-level tuning.
 * Precedence: explicit option > env var > built-in default.
 */
export interface GithubFetchOptions {
  /** Retry attempts after the initial try. Default 4 (env: GITHUB_FETCH_MAX_RETRIES). */
  maxRetries?: number;
  /** Base backoff delay in ms for 5xx/network retries. Default 1000 (env: GITHUB_FETCH_BASE_DELAY_MS). */
  baseDelayMs?: number;
  /** Cap (ms) on any single wait; a longer required rate-limit wait throws instead. Default 60000 (env: GITHUB_FETCH_MAX_DELAY_MS). */
  maxDelayMs?: number;
  /** Injectable fetch, mainly for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable sleep, mainly for testing. Defaults to a setTimeout-based delay. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/** Thrown when a GitHub rate limit cannot be cleared within the retry budget. */
export class GitHubRateLimitError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  readonly resetAt: Date | null;

  constructor(
    message: string,
    info: { status: number; retryAfterMs: number | null; resetAt: Date | null }
  ) {
    super(message);
    this.name = "GitHubRateLimitError";
    this.status = info.status;
    this.retryAfterMs = info.retryAfterMs;
    this.resetAt = info.resetAt;
  }
}

function readEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Capped exponential backoff with equal jitter (half fixed, half random). */
function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const ceiling = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const half = ceiling / 2;
  return Math.floor(half + Math.random() * half);
}

/** Statuses we transparently retry as transient server errors. */
function isTransientServerError(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * If the response indicates a rate limit, returns how long to wait (ms);
 * otherwise null. Prefers Retry-After, then x-ratelimit-reset.
 */
function parseRetryAfterMs(value: string): number | null {
  // Numeric seconds (most common — GitHub uses this form)
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  // HTTP-date form: "Retry-After: Wed, 21 Oct 2026 07:28:00 GMT"
  const date = new Date(value);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return null;
}

function rateLimitWaitMs(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const ms = parseRetryAfterMs(retryAfter);
    if (ms !== null) return ms;
  }
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (remaining === "0" && reset !== null) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) return Math.max(0, resetMs - Date.now());
  }
  return null;
}

function resetDateFrom(response: Response): Date | null {
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset === null) return null;
  const epoch = Number(reset);
  return Number.isFinite(epoch) ? new Date(epoch * 1000) : null;
}

function retryAfterMsFrom(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter === null) return null;
  return parseRetryAfterMs(retryAfter);
}

/**
 * fetch() for the GitHub API with retry, backoff and rate-limit handling.
 * Drop-in replacement: returns the final Response for the caller to inspect,
 * and only throws GitHubRateLimitError (rate limit unrecoverable within budget)
 * or re-throws a network error after retries are exhausted.
 */
export async function githubFetch(
  url: string | URL,
  init?: RequestInit,
  options: GithubFetchOptions = {}
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const maxRetries =
    options.maxRetries ?? readEnvInt("GITHUB_FETCH_MAX_RETRIES") ?? 4;
  const baseDelayMs =
    options.baseDelayMs ?? readEnvInt("GITHUB_FETCH_BASE_DELAY_MS") ?? 1000;
  const maxDelayMs =
    options.maxDelayMs ?? readEnvInt("GITHUB_FETCH_MAX_DELAY_MS") ?? 60000;

  const totalAttempts = maxRetries + 1;
  let attempt = 0;

  for (;;) {
    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (networkError) {
      // Abort signals must propagate immediately — retrying a cancelled request
      // defeats caller intent and wastes the retry budget.
      if (networkError instanceof Error && networkError.name === "AbortError") throw networkError;
      // Transport-level failure (DNS, socket, etc.): retry if budget remains.
      if (attempt >= maxRetries) throw networkError;
      const delay = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[GitHub] Network error (attempt ${attempt + 1}/${totalAttempts}), retrying in ${delay}ms: ` +
          (networkError instanceof Error ? networkError.message : String(networkError))
      );
      await sleep(delay);
      attempt++;
      continue;
    }

    const waitMs = rateLimitWaitMs(response);
    // A 403 is rate-limited if x-ratelimit-remaining is "0" regardless of
    // whether a parseable reset time is present (fixes narrow detection).
    const isRateLimited403 =
      response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
    const isRateLimited = response.status === 429 || isRateLimited403;

    if (isRateLimited) {
      // Reset is further out than we are willing to wait: surface a typed error
      // so the caller can degrade now instead of blocking the request.
      if (waitMs !== null && waitMs > maxDelayMs) {
        response.body?.cancel().catch(() => {});
        throw new GitHubRateLimitError(
          `GitHub rate limit exceeded; resets in ${Math.ceil(waitMs / 1000)}s, ` +
            `beyond the ${Math.ceil(maxDelayMs / 1000)}s retry budget`,
          { status: response.status, retryAfterMs: retryAfterMsFrom(response), resetAt: resetDateFrom(response) }
        );
      }
      if (attempt >= maxRetries) {
        response.body?.cancel().catch(() => {});
        throw new GitHubRateLimitError(
          `GitHub rate limit not cleared after ${totalAttempts} attempts`,
          { status: response.status, retryAfterMs: retryAfterMsFrom(response), resetAt: resetDateFrom(response) }
        );
      }
      const delay =
        waitMs !== null
          ? Math.min(waitMs, maxDelayMs)
          : backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[GitHub] Rate limited (status ${response.status}, attempt ${attempt + 1}/${totalAttempts}), waiting ${delay}ms`
      );
      // Cancel the unread body to free the underlying socket before sleeping.
      response.body?.cancel().catch(() => {});
      await sleep(delay);
      attempt++;
      continue;
    }

    if (isTransientServerError(response.status)) {
      // Out of retries: return the final response so the caller's existing
      // !response.ok handling throws/degrades exactly as it did before.
      if (attempt >= maxRetries) return response;
      const delay = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[GitHub] Server error ${response.status} (attempt ${attempt + 1}/${totalAttempts}), retrying in ${delay}ms`
      );
      // Cancel the unread body to free the underlying socket before sleeping.
      response.body?.cancel().catch(() => {});
      await sleep(delay);
      attempt++;
      continue;
    }

    // Success or a non-retryable status: hand back unchanged.
    return response;
  }
}


interface GitHubUser {
  login: string;
  avatar_url: string;
}

/**
 * Fetch repositories for an authenticated user
 */
export async function fetchUserRepos(accessToken: string): Promise<GitHubRepo[]> {
  const response = await githubFetch(`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repos: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch file content from a repository
 * @param accessToken - GitHub OAuth token
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - File path within the repository
 * @param ref - Optional commit SHA or branch name (defaults to HEAD)
 * @param fallbackBranch - Optional branch to try if ref fails
 */
export async function fetchFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  fallbackBranch?: string
): Promise<string> {
  // Remove leading slashes and handle Windows-style paths
  const cleanPath = path.replace(/^\/+/, "").replace(/\\/g, "/");

  // Skip "latest" as a ref - it's not a valid Git ref
  // Use fallbackBranch if ref is invalid, otherwise try without ref (uses default branch)
  let effectiveRef: string | undefined;
  if (ref && ref !== "latest" && ref.length > 0) {
    effectiveRef = ref;
  } else if (fallbackBranch) {
    // If ref is invalid, use the fallback branch as the primary
    effectiveRef = fallbackBranch;
    console.log("[GitHub] Ref is invalid ('latest' or empty), using branch: " + fallbackBranch);
  }

  const url = new URL(GITHUB_API_BASE + "/repos/" + owner + "/" + repo + "/contents/" + cleanPath);
  if (effectiveRef) {
    url.searchParams.set("ref", effectiveRef);
  }

  console.log("[GitHub] Fetching file: " + url.toString());

  const response = await githubFetch(url.toString(), {
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/vnd.github.v3.raw",
    },
  });

  if (!response.ok) {
    // If this failed and we were using something other than the fallback, try the fallback
    if (response.status === 404 && fallbackBranch && effectiveRef !== fallbackBranch) {
      console.log("[GitHub] File not found at ref " + (effectiveRef || "HEAD") + ", trying fallback branch: " + fallbackBranch);
      const fallbackUrl = new URL(GITHUB_API_BASE + "/repos/" + owner + "/" + repo + "/contents/" + cleanPath);
      fallbackUrl.searchParams.set("ref", fallbackBranch);

      const fallbackResponse = await githubFetch(fallbackUrl.toString(), {
        headers: {
          Authorization: "Bearer " + accessToken,
          Accept: "application/vnd.github.v3.raw",
        },
      });

      if (fallbackResponse.ok) {
        console.log("[GitHub] Found file using fallback branch: " + fallbackBranch);
        return fallbackResponse.text();
      }
    }

    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // Ignore error reading body
    }

    const errorDetails = "Failed to fetch file: " + response.status + " " + response.statusText;
    console.error("[GitHub] " + errorDetails);
    console.error("[GitHub] Request URL: " + url.toString());
    console.error("[GitHub] Owner: " + owner + ", Repo: " + repo + ", Path: " + cleanPath + ", Ref: " + (effectiveRef || "HEAD"));
    if (errorBody) {
      console.error("[GitHub] Response body: " + errorBody.substring(0, 500));
    }
    throw new Error(errorDetails + ": " + cleanPath);
  }

  return response.text();
}

/**
 * Fetch commit details
 */
export async function fetchCommit(
  accessToken: string,
  owner: string,
  repo: string,
  sha: string
): Promise<{
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string };
  };
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}> {
  const response = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch commit: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch commit diff/comparison between two commits
 * Used to show what changed in a commit for email and analysis
 */
export async function fetchCommitDiff(
  accessToken: string,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string
): Promise<{
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
  commits: Array<{
    sha: string;
    commit: { message: string; author: { name: string; email: string } };
  }>;
}> {
  const response = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch commit diff: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch repository file tree
 * Used for full repository analysis
 */
export async function fetchRepoTree(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<{
  sha: string;
  tree: Array<{
    path: string;
    type: "blob" | "tree";
    size?: number;
    sha: string;
  }>;
  truncated: boolean;
}> {
  const response = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repo tree: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch repository statistics for analytics
 */
export async function fetchRepoStats(
  accessToken: string,
  owner: string,
  repo: string
): Promise<{
  contributorStats: Array<{
    author: { login: string; avatar_url: string };
    total: number;
    weeks: Array<{ w: number; a: number; d: number; c: number }>;
  }>;
  codeFrequency: Array<[number, number, number]>; // [timestamp, additions, deletions]
  commitActivity: Array<{ days: number[]; total: number; week: number }>;
}> {
  // Stats endpoints are wrapped so a thrown rate-limit error degrades to an
  // empty dataset, preserving this function's original non-throwing contract.
  const statsHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
  };
  const safeStatsFetch = (path: string): Promise<Response | null> =>
    githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/${path}`, {
      headers: statsHeaders,
    }).catch(() => null);

  // Fetch multiple stats in parallel
  const [contributorRes, codeFreqRes, commitActivityRes] = await Promise.all([
    safeStatsFetch("stats/contributors"),
    safeStatsFetch("stats/code_frequency"),
    safeStatsFetch("stats/commit_activity"),
  ]);

  // GitHub returns 202 if stats are being computed - treat non-ok as no data
  const contributorStats = contributorRes && contributorRes.ok ? await contributorRes.json() : [];
  const codeFrequency = codeFreqRes && codeFreqRes.ok ? await codeFreqRes.json() : [];
  const commitActivity = commitActivityRes && commitActivityRes.ok ? await commitActivityRes.json() : [];

  return {
    contributorStats: Array.isArray(contributorStats) ? contributorStats : [],
    codeFrequency: Array.isArray(codeFrequency) ? codeFrequency : [],
    commitActivity: Array.isArray(commitActivity) ? commitActivity : [],
  };
}

/**
 * Generate a human-readable summary of what changed in a commit
 */
export function generateDiffSummary(
  files: Array<{ filename: string; additions: number; deletions: number; status: string }>
): {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  summary: string;
  filesByType: Record<string, number>;
} {
  const totalFiles = files.length;
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  // Group files by extension
  const filesByType: Record<string, number> = {};
  for (const file of files) {
    const ext = file.filename.split(".").pop()?.toLowerCase() || "other";
    filesByType[ext] = (filesByType[ext] || 0) + 1;
  }

  // Generate human-readable summary
  const fileTypeSummary = Object.entries(filesByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ext, count]) => `${count} ${ext} file${count > 1 ? "s" : ""}`)
    .join(", ");

  const summary = `${totalFiles} file${totalFiles !== 1 ? "s" : ""} changed: +${totalAdditions} -${totalDeletions} lines. (${fileTypeSummary})`;

  return {
    totalFiles,
    totalAdditions,
    totalDeletions,
    summary,
    filesByType,
  };
}

/**
 * Create a webhook for a repository
 */
export async function createWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<{ id: number }> {
  const response = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push", "pull_request"],
        config: {
          url: webhookUrl,
          content_type: "json",
          secret,
          insecure_ssl: "0",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create webhook: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a webhook from a repository
 */
export async function deleteWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void> {
  const response = await githubFetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks/${webhookId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete webhook: ${response.statusText}`);
  }
}

/**
 * Fetch README from a repository
 */
export async function fetchReadme(
  accessToken: string,
  owner: string,
  repo: string
): Promise<string | null> {
  const readmeFiles = ["README.md", "readme.md", "README", "README.txt"];

  for (const filename of readmeFiles) {
    try {
      return await fetchFileContent(accessToken, owner, repo, filename);
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Get authenticated user info
 */
export async function getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
  const response = await githubFetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Generate webhook secret
 */
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const expectedSignature = `sha256=${Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  return signature === expectedSignature;
}

/**
 * Search for files that import/depend on a given file (graph-aware analysis)
 * Uses GitHub Code Search API to find import statements
 */
export async function getDependentFiles(
  accessToken: string,
  owner: string,
  repo: string,
  targetFilePath: string
): Promise<Array<{ path: string; snippet: string }>> {
  // Extract the module name from the file path
  const fileName = targetFilePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '');
  if (!fileName) return [];

  // Build search query to find imports of this file
  const searchQueries = [
    `import+from+"${fileName}"`, // ES6 imports
    `require("${fileName}")`,    // CommonJS
    `from+"${targetFilePath.replace(/\.(ts|tsx|js|jsx)$/, '')}"`, // Full path imports
  ];

  const dependentFiles: Array<{ path: string; snippet: string }> = [];

  for (const query of searchQueries.slice(0, 1)) { // Limit API calls
    try {
      const response = await githubFetch(
        `${GITHUB_API_BASE}/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}&per_page=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3.text-match+json",
          },
        }
      );

      if (!response.ok) {
        // Code search may be rate limited, gracefully skip
        console.warn(`Code search failed: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      for (const item of data.items || []) {
        if (item.path === targetFilePath) continue; // Skip self

        const textMatches = item.text_matches || [];
        const snippet = textMatches.map((tm: { fragment: string }) => tm.fragment).join('\n...\n');

        dependentFiles.push({
          path: item.path,
          snippet: snippet || `Imports ${fileName}`,
        });
      }
    } catch (error) {
      console.warn("getDependentFiles search failed:", error);
    }
  }

  return dependentFiles.slice(0, 5); // Limit to 5 dependent files
}

/**
 * Post a comment on a Pull Request with analysis results
 */
export async function postPRComment(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<{ id: number } | null> {
  try {
    const response = await githubFetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      }
    );

    if (!response.ok) {
      console.error(`Failed to post PR comment: ${response.statusText}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("postPRComment failed:", error);
    return null;
  }
}

/**
 * Format issues for PR comment (markdown)
 */
export function formatPRComment(
  issues: Array<{
    filePath: string;
    line: number;
    severity: string;
    message: string;
    explanation: string;
    suggestedFix?: string;
    codeSnippet?: string;
  }>,
  commitSha: string
): string {
  if (issues.length === 0) {
    return `## 🛡️ Code Police Report

✅ **No issues found!** Great job keeping the code clean.

---
*Analyzed commit: \`${commitSha.slice(0, 7)}\`*`;
  }

  const severityCounts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
    low: issues.filter(i => i.severity === 'low').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  const badge = Object.entries(severityCounts)
    .filter(([, count]) => count > 0)
    .map(([sev, count]) => `${count} ${sev}`)
    .join(' | ');

  const issuesList = issues.slice(0, 10).map(issue => {
    const emoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    }[issue.severity] || '⚪';

    let block = `### ${emoji} ${issue.message}

**File:** \`${issue.filePath}:${issue.line}\`
**Severity:** ${issue.severity.toUpperCase()}

${issue.explanation}`;

    if (issue.codeSnippet) {
      block += `

\`\`\`typescript
${issue.codeSnippet}
\`\`\``;
    }

    if (issue.suggestedFix) {
      block += `

💡 **Suggested Fix:** ${issue.suggestedFix}`;
    }

    return block;
  }).join('\n\n---\n\n');

  return `## 🛡️ Code Police Report

**Summary:** ${badge}

---

${issuesList}

${issues.length > 10 ? `\n*...and ${issues.length - 10} more issues*\n` : ''}
---
*Analyzed commit: \`${commitSha.slice(0, 7)}\`*`;
}
