/**
 * ============================================================================
 * CODE POLICE - PR CREATOR
 * ============================================================================
 * Creates GitHub pull requests with automated fixes.
 * Handles branch creation, file commits, and PR management.
 */

import type { Fix } from "./fix-generator";
import type { CodeIssue, IssueSeverity } from "@/types";

const GITHUB_API_BASE = "https://api.github.com";

export interface PRCreationResult {
    success: boolean;
    prNumber?: number;
    prUrl?: string;
    branchName?: string;
    error?: string;
}

export interface FileChange {
    path: string;
    content: string;
    originalContent: string;
}

/**
 * Get the SHA of a branch reference
 */
export async function getBranchRef(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string
): Promise<string> {
    const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to get branch ref: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.object.sha;
}

/**
 * Create a new branch from a given SHA
 */
export async function createBranch(
    accessToken: string,
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string
): Promise<void> {
    const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha: fromSha,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            `Failed to create branch: ${response.status} ${response.statusText}${error.message ? ` - ${error.message}` : ""
            }`
        );
    }
}

/**
 * Get file content and SHA for updating
 */
export async function getFileInfo(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
    branch: string
): Promise<{ sha: string; content: string }> {
    const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to get file info: ${response.status}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { sha: data.sha, content };
}

/**
 * Create or update a file in a repository
 */
export async function createOrUpdateFile(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    fileSha?: string
): Promise<{ sha: string }> {
    const body: Record<string, unknown> = {
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
    };

    if (fileSha) {
        body.sha = fileSha;
    }

    const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            `Failed to update file: ${response.status}${error.message ? ` - ${error.message}` : ""}`
        );
    }

    const data = await response.json();
    return { sha: data.content.sha };
}

/**
 * Create a pull request
 */
export async function createPullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string
): Promise<{ number: number; url: string }> {
    const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title,
                body,
                head: headBranch,
                base: baseBranch,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            `Failed to create PR: ${response.status}${error.message ? ` - ${error.message}` : ""}`
        );
    }

    const data = await response.json();
    return { number: data.number, url: data.html_url };
}

/**
 * Add labels to a pull request
 */
export async function addPRLabels(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    labels: string[]
): Promise<void> {
    const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${prNumber}/labels`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ labels }),
        }
    );

    // Labels endpoint may fail if labels don't exist, but that's ok
    if (!response.ok) {
        console.warn(`[PRCreator] Failed to add labels: ${response.status}`);
    }
}

/**
 * Generate branch name for fix PR
 */
export function generateFixBranchName(commitSha: string): string {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const shortSha = commitSha.slice(0, 7);
    return `code-police/fix-${timestamp}-${shortSha}`;
}

/**
 * Generate PR labels based on issue severities
 */
export function generatePRLabels(issues: CodeIssue[]): string[] {
    const labels = ["automated-fix", "code-police"];

    const severities = new Set(issues.map(i => i.severity));
    if (severities.has("critical")) labels.push("priority:critical");
    if (severities.has("high")) labels.push("priority:high");

    const categories = new Set(issues.map(i => i.category));
    if (categories.has("security")) labels.push("security");
    if (categories.has("bug")) labels.push("bug");
    if (categories.has("performance")) labels.push("performance");

    return labels;
}

/**
 * Generate PR description with analysis report
 */
export function generatePRDescription(input: {
    commitSha: string;
    branch: string;
    fixes: Fix[];
    unfixableIssues: { issueId: string; reason: string }[];
    issues: CodeIssue[];
}): string {
    const { commitSha, branch, fixes, unfixableIssues, issues } = input;

    let body = `## 🛡️ Code Police - Automated Fix

This pull request contains automated fixes generated by Code Police.

**Analyzed Commit:** \`${commitSha.slice(0, 7)}\`
**Branch:** \`${branch}\`

---

### ✅ Fixed Issues (${fixes.length})

`;

    if (fixes.length > 0) {
        for (const fix of fixes) {
            const issue = issues.find(i => i.id === fix.issueId);
            body += `- **${fix.filePath}**: ${fix.explanation}`;
            if (issue) {
                body += ` (${issue.severity})`;
            }
            body += `\n`;
        }
    } else {
        body += "_No automatic fixes applied._\n";
    }

    if (unfixableIssues.length > 0) {
        body += `
---

### ⚠️ Issues Requiring Manual Review (${unfixableIssues.length})

`;
        for (const uf of unfixableIssues) {
            const issue = issues.find(i => i.id === uf.issueId);
            if (issue) {
                body += `- **${issue.filePath}:${issue.line}** - ${issue.message}\n  - _Reason:_ ${uf.reason}\n`;
            }
        }
    }

    body += `
---

### 📋 Testing Recommendations

1. Review each fix to ensure it maintains intended functionality
2. Run existing tests to verify no regressions
3. Test affected code paths manually

---

_Generated by Code Police AI 🤖_
`;

    return body;
}

/**
 * Full workflow: Create a PR with fixes
 */
export async function createFixPullRequest(input: {
    accessToken: string;
    owner: string;
    repo: string;
    baseBranch: string;
    commitSha: string;
    fixes: Fix[];
    unfixableIssues: { issueId: string; reason: string }[];
    issues: CodeIssue[];
    fileChanges: Map<string, string>; // path -> new content
}): Promise<PRCreationResult> {
    const {
        accessToken,
        owner,
        repo,
        baseBranch,
        commitSha,
        fixes,
        unfixableIssues,
        issues,
        fileChanges,
    } = input;

    if (fileChanges.size === 0) {
        return { success: false, error: "No file changes to commit" };
    }

    try {
        // 1. Get the base branch SHA
        console.log(`[PRCreator] Getting base ref for ${baseBranch}`);
        const baseSha = await getBranchRef(accessToken, owner, repo, baseBranch);

        // 2. Create fix branch
        const branchName = generateFixBranchName(commitSha);
        console.log(`[PRCreator] Creating branch ${branchName}`);
        await createBranch(accessToken, owner, repo, branchName, baseSha);

        // 3. Commit each file change
        for (const [path, content] of fileChanges.entries()) {
            console.log(`[PRCreator] Updating file ${path}`);
            const fileInfo = await getFileInfo(accessToken, owner, repo, path, branchName);
            const fixesForFile = fixes.filter(f => f.filePath === path);
            const message = fixesForFile.length > 0
                ? `fix(${path.split('/').pop()}): ${fixesForFile[0].explanation.slice(0, 50)}`
                : `fix: update ${path}`;

            await createOrUpdateFile(
                accessToken,
                owner,
                repo,
                path,
                content,
                message,
                branchName,
                fileInfo.sha
            );
        }

        // 4. Create pull request
        const prTitle = `🛡️ Code Police: Automated fixes for ${commitSha.slice(0, 7)}`;
        const prBody = generatePRDescription({
            commitSha,
            branch: baseBranch,
            fixes,
            unfixableIssues,
            issues,
        });

        console.log(`[PRCreator] Creating pull request`);
        const pr = await createPullRequest(
            accessToken,
            owner,
            repo,
            prTitle,
            prBody,
            branchName,
            baseBranch
        );

        // 5. Add labels (best effort)
        const labels = generatePRLabels(issues);
        await addPRLabels(accessToken, owner, repo, pr.number, labels);

        console.log(`[PRCreator] Created PR #${pr.number}: ${pr.url}`);

        return {
            success: true,
            prNumber: pr.number,
            prUrl: pr.url,
            branchName,
        };
    } catch (error) {
        console.error("[PRCreator] Failed to create PR:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create pull request",
        };
    }
}
