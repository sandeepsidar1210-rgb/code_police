/**
 * ============================================================================
 * SELF-HEALING AGENT - REPO MANAGER (FORK-BASED WITH FALLBACK)
 * ============================================================================
 * Handles all Git operations — pushes directly to the target repo:
 * 
 * 1. Clone the target repo (with bot token for auth)
 * 2. Create branch via GitHub API on the target repo
 * 3. Fix bugs, commit with [AI-AGENT] prefix
 * 4. Push directly to the target repo
 * 5. Create PR: branch → default branch (same-repo PR)
 * 
 * Requires: GITHUB_BOT_TOKEN in .env with write access to target repos.
 * Recommended Scopes: 'repo' (for full repository access)
 */

import { execSync } from "child_process";
import { existsSync, rmSync, mkdirSync } from "fs";
import path from "path";

// ============================================================================
// CONSTANTS
// ============================================================================

const SANDBOX_BASE = "/tmp/self-healing";
const BRANCH_SUFFIX = "AI_Fix";
const COMMIT_PREFIX = "[AI-AGENT]";

/**
 * Get the bot token from environment
 */
export function getBotToken(): string {
    const token = process.env.GITHUB_BOT_TOKEN;
    if (!token) {
        throw new Error(
            "GITHUB_BOT_TOKEN is not set. Add it to your .env file. " +
            "Create a classic PAT at: GitHub → Settings → Developer settings → Personal Access Tokens. " +
            "Required scopes: 'repo' for full repository access."
        );
    }
    return token;
}

/**
 * Get the authenticated bot's GitHub username
 */
export async function getBotUsername(): Promise<string> {
    const token = getBotToken();
    try {
        const response = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        if (response.ok) {
            const data = await response.json();
            return data.login;
        }
    } catch {
        // Ignore
    }
    return "unknown";
}

/**
 * Get the standard branch name per RIFT 2026 convention
 * Rules: All UPPERCASE, underscores only, ends with _AI_Fix
 * @param teamName - e.g. "TECH CHAOS" → "TECH_CHAOS"
 * @param leaderName - e.g. "Anurag Mishra" → "ANURAG_MISHRA"
 */
export function getHealingBranchName(teamName: string, leaderName: string): string {
    const team = teamName.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    const leader = leaderName.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    return `${team}_${leader}_${BRANCH_SUFFIX}`;
}

/**
 * Get the sandbox directory for a session
 */
export function getSandboxDir(sessionId: string): string {
    return path.join(SANDBOX_BASE, sessionId);
}

// ============================================================================
// FORK OPERATIONS
// ============================================================================

export interface ForkResult {
    forkOwner: string;
    forkRepo: string;
    forkUrl: string;
    success: boolean;
    error?: string;
}

/**
 * Fork a repository under the bot account.
 * If the fork already exists, GitHub returns the existing fork.
 */
export async function forkRepo(
    owner: string,
    repo: string,
): Promise<ForkResult> {
    const token = getBotToken();
    console.log(`[RepoManager] Forking ${owner}/${repo}...`);

    // Retry fork up to 2 times (GitHub API can be flaky)
    const maxForkAttempts = 2;
    for (let forkAttempt = 1; forkAttempt <= maxForkAttempts; forkAttempt++) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/forks`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ default_branch_only: false }),
                }
            );

            if (!response.ok && response.status !== 202) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.message || response.statusText;

                // Provide helpful context for common errors
                if (response.status === 403) {
                    throw new Error(
                        `Fork failed (403): ${errorMsg}. ` +
                        `GitHub token may lack 'public_repo' or 'repo' scope. ` +
                        `Go to GitHub Settings → Developer settings → Personal Access Tokens to update.`
                    );
                }

                throw new Error(
                    `Fork failed (${response.status}): ${errorMsg}`
                );
            }

            const forkData = await response.json();
            const forkOwner = forkData.owner?.login || forkData.full_name?.split("/")[0];
            const forkRepoName = forkData.name || repo;

            console.log(`[RepoManager] ✅ Fork created/found: ${forkOwner}/${forkRepoName}`);

            // Wait for fork to be ready (GitHub creates forks asynchronously)
            await waitForFork(forkOwner, forkRepoName, token);

            return {
                forkOwner,
                forkRepo: forkRepoName,
                forkUrl: `https://github.com/${forkOwner}/${forkRepoName}`,
                success: true,
            };
        } catch (error) {
            const err = error as Error;
            if (forkAttempt < maxForkAttempts) {
                console.warn(`[RepoManager] Fork attempt ${forkAttempt} failed: ${err.message}. Retrying in 3s...`);
                await new Promise((r) => setTimeout(r, 3000));
                continue;
            }
            console.error(`[RepoManager] Fork failed after ${maxForkAttempts} attempts:`, err.message);
            return {
                forkOwner: "",
                forkRepo: "",
                forkUrl: "",
                success: false,
                error: err.message,
            };
        }
    }
    return { forkOwner: "", forkRepo: "", forkUrl: "", success: false, error: "Fork failed" };
}

/**
 * Wait for a fork to become available (GitHub creates forks asynchronously)
 */
async function waitForFork(
    owner: string,
    repo: string,
    token: string,
    maxWaitMs: number = 15000
): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                    },
                }
            );
            if (response.ok) return;
        } catch {
            // Not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
    console.warn(`[RepoManager] Fork may not be fully ready after ${maxWaitMs}ms, proceeding anyway`);
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

/**
 * Clone a repository into the sandbox.
 * Clones the FORK (bot has write access to it).
 * If targetBranch is provided, clones that specific branch instead of the default.
 */
export async function cloneRepo(
    repoUrl: string,
    sessionId: string,
    forkOwner?: string,
    forkRepoName?: string,
    targetBranch?: string,
): Promise<string> {
    const sandboxDir = getSandboxDir(sessionId);

    if (!existsSync(SANDBOX_BASE)) {
        mkdirSync(SANDBOX_BASE, { recursive: true });
    }

    if (existsSync(sandboxDir)) {
        rmSync(sandboxDir, { recursive: true, force: true });
    }

    // Clone the fork if available (we have write access), otherwise clone original with token
    let cloneTarget: string;
    const token = getBotToken();
    if (forkOwner && forkRepoName) {
        cloneTarget = `https://${token}@github.com/${forkOwner}/${forkRepoName}.git`;
        console.log(`[RepoManager] Cloning FORK: ${forkOwner}/${forkRepoName}`);
    } else {
        // Even in fallback mode, embed token for push auth
        const { owner, repo } = parseGitHubUrl(repoUrl);
        cloneTarget = `https://${token}@github.com/${owner}/${repo}.git`;
        console.log(`[RepoManager] Cloning original (with auth): ${owner}/${repo}`);
    }

    // Build clone command — use --branch to target a specific branch, otherwise shallow clone default
    const branchFlag = targetBranch && targetBranch !== "main" ? `--branch ${targetBranch}` : "";
    const cloneCmd = `git clone --depth=1 ${branchFlag} "${cloneTarget}" "${sandboxDir}"`;
    console.log(`[RepoManager] Clone command: git clone --depth=1 ${branchFlag ? `--branch ${targetBranch}` : "(default branch)"}`);

    try {
        execSync(cloneCmd, {
            timeout: 60000,
            stdio: "pipe",
        });

        // Add original as "upstream" remote
        if (forkOwner && forkRepoName) {
            const { owner, repo } = parseGitHubUrl(repoUrl);
            try {
                execSync(
                    `git -C "${sandboxDir}" remote add upstream "https://github.com/${owner}/${repo}.git"`,
                    { stdio: "pipe" }
                );
            } catch {
                // upstream may already exist
            }
        }

        console.log(`[RepoManager] ✅ Clone successful`);
        return sandboxDir;
    } catch (error) {
        const err = error as Error & { stderr?: Buffer };
        const stderr = err.stderr?.toString() || err.message;
        throw new Error(`Failed to clone repository: ${stderr}`);
    }
}

/**
 * Create and checkout the healing branch
 */
export function createBranch(repoDir: string, branchName: string): string {
    console.log(`[RepoManager] Creating branch: ${branchName}`);

    try {
        try {
            execSync(`git -C "${repoDir}" fetch origin ${branchName}`, { stdio: "pipe" });
            execSync(`git -C "${repoDir}" checkout ${branchName}`, { stdio: "pipe" });
            console.log(`[RepoManager] Checked out existing branch: ${branchName}`);
        } catch {
            execSync(`git -C "${repoDir}" checkout -b ${branchName}`, { stdio: "pipe" });
            console.log(`[RepoManager] Created new branch: ${branchName}`);
        }
        return branchName;
    } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to create branch: ${err.message}`);
    }
}

/**
 * Create branch on GitHub via REST API (bypasses git push auth issues).
 * Works by getting the HEAD SHA of the default branch and creating a new ref.
 */
export async function createBranchViaApi(
    owner: string,
    repo: string,
    branchName: string,
): Promise<{ success: boolean; error?: string }> {
    const token = getBotToken();
    console.log(`[RepoManager] Creating branch via API: ${owner}/${repo}:${branchName}`);

    try {
        // Step 1: Get the default branch's HEAD SHA
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        if (!repoRes.ok) {
            return { success: false, error: `Failed to get repo info: ${repoRes.status}` };
        }
        const repoData = await repoRes.json();
        const defaultBranch = repoData.default_branch || "main";

        // Step 2: Get the SHA of the default branch
        const refRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            }
        );
        if (!refRes.ok) {
            return { success: false, error: `Failed to get ref for ${defaultBranch}: ${refRes.status}` };
        }
        const refData = await refRes.json();
        const sha = refData.object.sha;

        // Step 3: Check if the branch already exists
        const existingRef = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branchName}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            }
        );

        if (existingRef.ok) {
            // Branch already exists — update it to point to latest SHA
            const updateRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ sha, force: true }),
                }
            );
            if (!updateRes.ok) {
                const errData = await updateRes.json().catch(() => ({}));
                return { success: false, error: `Failed to update branch: ${errData.message || updateRes.status}` };
            }
            console.log(`[RepoManager] ✅ Branch ${branchName} updated via API`);
            return { success: true };
        }

        // Step 4: Create the new branch ref
        const createRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/refs`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ref: `refs/heads/${branchName}`,
                    sha,
                }),
            }
        );

        if (!createRes.ok) {
            const errData = await createRes.json().catch(() => ({}));
            return { success: false, error: `Failed to create branch: ${errData.message || createRes.status}` };
        }

        console.log(`[RepoManager] ✅ Branch ${branchName} created via API on ${owner}/${repo}`);
        return { success: true };
    } catch (error) {
        const err = error as Error;
        console.error(`[RepoManager] ❌ API branch creation failed:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Stage all changes, commit with [AI-AGENT] prefix
 */
export function commitChanges(repoDir: string, message: string): string | null {
    const fullMessage = `${COMMIT_PREFIX} ${message}`;
    console.log(`[RepoManager] Committing: ${fullMessage}`);

    try {
        execSync(`git -C "${repoDir}" config user.email "ai-agent@protocol-zero.dev"`, { stdio: "pipe" });
        execSync(`git -C "${repoDir}" config user.name "Protocol Zero AI Agent"`, { stdio: "pipe" });
        execSync(`git -C "${repoDir}" add -A`, { stdio: "pipe" });

        // Check if there are changes
        try {
            execSync(`git -C "${repoDir}" diff --cached --quiet`, { stdio: "pipe" });
            console.log("[RepoManager] No changes to commit");
            return null;
        } catch {
            // There ARE changes — continue
        }

        execSync(`git -C "${repoDir}" commit -m "${fullMessage.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
        const sha = execSync(`git -C "${repoDir}" rev-parse HEAD`, { stdio: "pipe" }).toString().trim();
        console.log(`[RepoManager] ✅ Committed: ${sha.slice(0, 7)}`);
        return sha;
    } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to commit: ${err.message}`);
    }
}

/**
 * Push the branch to origin (the fork — bot has write access)
 */
export function pushBranch(repoDir: string, branchName: string): void {
    console.log(`[RepoManager] Pushing branch: ${branchName}`);
    try {
        execSync(`git -C "${repoDir}" push -u origin ${branchName} --force`, {
            timeout: 30000,
            stdio: "pipe",
        });
        console.log(`[RepoManager] ✅ Push successful`);
    } catch (error) {
        const err = error as Error & { stderr?: Buffer };
        const stderr = err.stderr?.toString() || err.message;
        throw new Error(`Failed to push: ${stderr}`);
    }
}

/**
 * Get the HEAD commit SHA
 */
export function getLatestCommitSha(repoDir: string): string {
    return execSync(`git -C "${repoDir}" rev-parse HEAD`, { stdio: "pipe" }).toString().trim();
}

/**
 * Get the total number of commits on the healing branch
 */
export function getCommitCount(repoDir: string, branchName: string): number {
    try {
        const mainBranch = getDefaultBranch(repoDir);
        const output = execSync(
            `git -C "${repoDir}" rev-list --count ${mainBranch}..${branchName}`,
            { stdio: "pipe" }
        ).toString().trim();
        return parseInt(output, 10) || 0;
    } catch {
        return 0;
    }
}

/**
 * Get the default branch name (main/master)
 */
export function getDefaultBranch(repoDir: string): string {
    try {
        const output = execSync(
            `git -C "${repoDir}" symbolic-ref refs/remotes/origin/HEAD`,
            { stdio: "pipe" }
        ).toString().trim();
        return output.replace("refs/remotes/origin/", "");
    } catch {
        try {
            execSync(`git -C "${repoDir}" rev-parse --verify origin/main`, { stdio: "pipe" });
            return "main";
        } catch {
            return "master";
        }
    }
}

/**
 * Clean up the sandbox directory
 */
export function cleanupSandbox(sessionId: string): void {
    const sandboxDir = getSandboxDir(sessionId);
    if (existsSync(sandboxDir)) {
        console.log(`[RepoManager] Cleaning up sandbox: ${sandboxDir}`);
        rmSync(sandboxDir, { recursive: true, force: true });
    }
}

/**
 * Parse a GitHub URL to extract owner and repo name
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
    const patterns = [
        /github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
        /github\.com\/([^/]+)\/([^/]+?)\/?$/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return { owner: match[1], repo: match[2] };
    }
    throw new Error(`Invalid GitHub URL: ${url}`);
}

// ============================================================================
// CROSS-FORK PR CREATION
// ============================================================================

export interface PullRequestResult {
    success: boolean;
    prNumber?: number;
    prUrl?: string;
    error?: string;
}

/**
 * Create a cross-fork Pull Request.
 * PR goes: forkOwner:branchName → originalOwner:defaultBranch
 * Works on ANY public repo.
 */
export async function createPullRequest(
    repoDir: string,
    originalOwner: string,
    originalRepo: string,
    branchName: string,
    forkOwner: string,
    bugsFixed: number,
    totalBugs: number,
    attempts: number,
    score: number,
): Promise<PullRequestResult> {
    const token = getBotToken();
    const defaultBranch = getDefaultBranch(repoDir);

    console.log(`[RepoManager] Creating cross-fork PR: ${forkOwner}:${branchName} → ${originalOwner}/${originalRepo}:${defaultBranch}`);

    const title = `[AI-AGENT] Self-Healing: Fixed ${bugsFixed}/${totalBugs} bugs (Score: ${score}/100)`;
    const body = `## 🤖 AI-AGENT Self-Healing Report

### Branch: \`${branchName}\`

| Metric | Value |
|--------|-------|
| Bugs Found | ${totalBugs} |
| Bugs Fixed | ${bugsFixed} |
| Attempts | ${attempts}/5 |
| Score | ${score}/100 |

---

### Naming Compliance
- ✅ Branch: \`${branchName}\` (UPPERCASE, underscores, ends with _AI_Fix)
- ✅ All commits prefixed with \`[AI-AGENT]\`
- ✅ No direct push to \`${defaultBranch}\`
- ✅ Fully automated — zero human intervention
- ✅ Fork-based PR (no direct repo access needed)

### How it works
1. Repository forked under bot account
2. Cloned into sandbox environment
3. Test suite auto-detected and executed
4. AI Scout agent scanned for bugs
5. AI Engineer agent wrote targeted fixes
6. Changes committed with \`[AI-AGENT]\` prefix
7. Pushed to fork, cross-fork PR created
8. Iterated up to 5 times until tests pass

---
*Generated by Protocol Zero Self-Healing Agent*`;

    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Cross-fork PR: head is "forkOwner:branchName"
            const response = await fetch(
                `https://api.github.com/repos/${originalOwner}/${originalRepo}/pulls`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        title,
                        body,
                        head: `${forkOwner}:${branchName}`,
                        base: defaultBranch,
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 422 && errorData.errors?.[0]?.message?.includes("pull request already exists")) {
                    console.log(`[RepoManager] PR already exists for ${branchName}`);
                    // Try to find the existing PR URL
                    try {
                        const searchRes = await fetch(
                            `https://api.github.com/repos/${originalOwner}/${originalRepo}/pulls?head=${forkOwner}:${branchName}&state=open`,
                            { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
                        );
                        if (searchRes.ok) {
                            const prs = await searchRes.json();
                            if (prs.length > 0) {
                                return { success: true, prNumber: prs[0].number, prUrl: prs[0].html_url };
                            }
                        }
                    } catch { /* ignore search error */ }
                    return { success: true, prUrl: `https://github.com/${originalOwner}/${originalRepo}/pulls` };
                }
                const errMsg = `GitHub API error ${response.status}: ${errorData.message || response.statusText}`;
                if (attempt < maxRetries) {
                    console.warn(`[RepoManager] PR attempt ${attempt} failed: ${errMsg}. Retrying in 3s...`);
                    await new Promise((r) => setTimeout(r, 3000));
                    continue;
                }
                throw new Error(errMsg);
            }

            const prData = await response.json();
            console.log(`[RepoManager] ✅ PR created: #${prData.number} - ${prData.html_url}`);
            return { success: true, prNumber: prData.number, prUrl: prData.html_url };
        } catch (error) {
            const err = error as Error;
            if (attempt < maxRetries) {
                console.warn(`[RepoManager] PR attempt ${attempt} failed: ${err.message}. Retrying in 3s...`);
                await new Promise((r) => setTimeout(r, 3000));
                continue;
            }
            console.error(`[RepoManager] Failed to create PR after ${maxRetries} attempts:`, err.message);
            return { success: false, error: err.message };
        }
    }
    return { success: false, error: "Max PR retries exceeded" };
}
