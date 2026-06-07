/**
 * ============================================================================
 * CODE POLICE - AUTO-FIX UTILITY
 * ============================================================================
 * Encapsulates the fix generation + PR creation logic for reuse from:
 * - Webhook handler (automatic on push)
 * - Issues API (manual trigger)
 */

import { generateFixes, applyMultipleFixes, type Fix } from "./fix-generator";
import { createFixPullRequest, type PRCreationResult } from "./pr-creator";
import { fetchFileContent } from "./github";
import { detectLanguage } from "./analyzer";
import type { CodeIssue } from "@/types";

export interface AutoFixInput {
    githubToken: string;
    owner: string;
    repo: string;
    branch: string;
    commitSha: string;
    issues: CodeIssue[];
    analysisRunId: string;
    /** Only fix issues with these severities (default: critical, high, medium) */
    severityFilter?: string[];
}

export interface AutoFixResult {
    success: boolean;
    prNumber?: number;
    prUrl?: string;
    branchName?: string;
    fixesGenerated: number;
    filesChanged: number;
    error?: string;
    errors?: string[];
}

/**
 * Generate fixes for detected issues and create a PR with the fixes.
 * 
 * This function:
 * 1. Filters issues by severity
 * 2. Groups issues by file
 * 3. Fetches file contents from GitHub
 * 4. Generates AI fixes for each file
 * 5. Applies fixes to create new file contents
 * 6. Creates a PR with all changes
 */
export async function generateAndCreateFixPR(input: AutoFixInput): Promise<AutoFixResult> {
    const {
        githubToken,
        owner,
        repo,
        branch,
        commitSha,
        issues,
        severityFilter = ["critical", "high", "medium"],
    } = input;

    console.log(`[Auto-Fix] Starting for commit ${commitSha.slice(0, 7)}`);
    console.log(`[Auto-Fix] Total issues: ${issues.length}, severity filter: ${severityFilter.join(", ")}`);

    // Filter to fixable issues
    const fixableIssues = issues.filter(i => severityFilter.includes(i.severity));

    if (fixableIssues.length === 0) {
        console.log("[Auto-Fix] No issues match severity filter, skipping");
        return {
            success: false,
            fixesGenerated: 0,
            filesChanged: 0,
            error: "No issues match the severity filter for auto-fix",
        };
    }

    console.log(`[Auto-Fix] Fixable issues after filter: ${fixableIssues.length}`);

    // Group issues by file
    const issuesByFile = new Map<string, CodeIssue[]>();
    for (const issue of fixableIssues) {
        const existing = issuesByFile.get(issue.filePath) || [];
        existing.push(issue);
        issuesByFile.set(issue.filePath, existing);
    }

    console.log(`[Auto-Fix] Issues grouped into ${issuesByFile.size} files`);

    // Generate fixes for each file
    const allFixes: Fix[] = [];
    const fileChanges = new Map<string, string>();
    const errors: string[] = [];

    for (const [filePath, fileIssues] of issuesByFile.entries()) {
        console.log(`[Auto-Fix] Processing ${filePath} (${fileIssues.length} issues)`);

        try {
            // Fetch file content
            const fileContent = await fetchFileContent(githubToken, owner, repo, filePath, commitSha);
            const language = detectLanguage(filePath);

            // Generate fixes using AI
            const fixResult = await generateFixes({
                fileContent,
                filePath,
                language,
                issues: fileIssues,
            });

            console.log(`[Auto-Fix] Generated ${fixResult.fixes.length} fixes for ${filePath}`);
            allFixes.push(...fixResult.fixes);

            // Apply fixes to get new content
            if (fixResult.fixes.length > 0) {
                const newContent = applyMultipleFixes(fileContent, fixResult.fixes);
                if (newContent !== fileContent) {
                    fileChanges.set(filePath, newContent);
                    console.log(`[Auto-Fix] ✅ Changes applied for ${filePath}`);
                } else {
                    console.warn(`[Auto-Fix] ⚠️ No actual changes for ${filePath}`);
                    errors.push(`${filePath}: Fixes generated but no changes applied`);
                }
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            console.error(`[Auto-Fix] Failed to process ${filePath}:`, errorMsg);
            errors.push(`${filePath}: ${errorMsg}`);
        }
    }

    console.log(`[Auto-Fix] Total fixes: ${allFixes.length}, files with changes: ${fileChanges.size}`);

    // Create PR if we have changes
    if (fileChanges.size > 0) {
        console.log(`[Auto-Fix] Creating PR with ${fileChanges.size} file changes`);

        const prResult = await createFixPullRequest({
            accessToken: githubToken,
            owner,
            repo,
            baseBranch: branch,
            commitSha,
            fixes: allFixes,
            unfixableIssues: [],
            issues: fixableIssues,
            fileChanges,
        });

        if (prResult.success) {
            console.log(`[Auto-Fix] ✅ PR created: ${prResult.prUrl}`);
            return {
                success: true,
                prNumber: prResult.prNumber,
                prUrl: prResult.prUrl,
                branchName: prResult.branchName,
                fixesGenerated: allFixes.length,
                filesChanged: fileChanges.size,
            };
        } else {
            console.error(`[Auto-Fix] ❌ PR creation failed: ${prResult.error}`);
            return {
                success: false,
                fixesGenerated: allFixes.length,
                filesChanged: 0,
                error: prResult.error,
                errors,
            };
        }
    } else {
        console.log("[Auto-Fix] No file changes to commit");
        return {
            success: false,
            fixesGenerated: allFixes.length,
            filesChanged: 0,
            error: allFixes.length > 0
                ? "Fixes generated but could not be applied to source files"
                : "No fixes could be generated for the issues",
            errors,
        };
    }
}
