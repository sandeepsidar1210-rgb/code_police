import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchRepoTree, fetchFileContent } from "@/lib/agents/code-police/github";
import { analyzeCode, detectLanguage, generateAnalysisSummary } from "@/lib/agents/code-police/analyzer";
import {
    generateCacheKey,
    getCachedAnalysis,
    setCachedAnalysis,
    processBatch,
    getCacheStats,
    type CachedAnalysisResult,
} from "@/lib/agents/code-police/analysis-cache";
import type { CodeIssue, IssueSeverity, IssueCategory } from "@/types";

/**
 * ============================================================================
 * CODE POLICE - FULL REPOSITORY ANALYSIS (OPTIMIZED)
 * ============================================================================
 * POST /api/code-police/analyze-repo
 * 
 * Analyzes the entire repository with:
 * - Parallel processing (5 files at a time)
 * - Multi-layer caching (in-memory + Redis)
 * - Smart file filtering
 */

const CONCURRENCY = 5; // Files analyzed in parallel
const MAX_FILES = 50;   // Max files per scan

// File patterns to analyze
const ANALYZABLE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.php', '.sql', '.sol', '.vue', '.svelte',
];

// Patterns to exclude
const EXCLUDED_PATTERNS = [
    /^node_modules\//,
    /^\.git\//,
    /^dist\//,
    /^build\//,
    /^\.next\//,
    /^out\//,
    /^coverage\//,
    /^vendor\//,
    /^__pycache__\//,
    /\.min\.(js|css)$/,
    /\.map$/,
    /\.d\.ts$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
];

function shouldAnalyzeFile(filename: string): boolean {
    for (const pattern of EXCLUDED_PATTERNS) {
        if (pattern.test(filename)) return false;
    }
    const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
    return ANALYZABLE_EXTENSIONS.includes(ext);
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const authResult = await auth();
        const userId = authResult?.userId;

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { projectId } = body;

        if (!projectId) {
            return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
        }

        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        // Get project
        const projectDoc = await adminDb.collection("projects").doc(projectId).get();
        if (!projectDoc.exists) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const project = projectDoc.data();
        if (project?.userId !== userId) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const owner = project.githubOwner;
        const repo = project.githubRepoName;
        const branch = project.defaultBranch || "main";

        // Get GitHub token
        let githubToken: string | null = null;
        try {
            const clerkResponse = await fetch(
                `https://api.clerk.com/v1/users/${userId}/oauth_access_tokens/oauth_github`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
                    },
                }
            );

            if (clerkResponse.ok) {
                const tokens = await clerkResponse.json();
                if (tokens && tokens.length > 0 && tokens[0].token) {
                    githubToken = tokens[0].token;
                }
            }
        } catch {
            // Fallback to stored token
        }

        if (!githubToken) {
            const userDoc = await adminDb.collection("users").doc(userId).get();
            githubToken = userDoc.data()?.githubAccessToken || null;
        }

        if (!githubToken) {
            return NextResponse.json(
                { error: "GitHub token not found. Please reconnect your GitHub account." },
                { status: 400 }
            );
        }

        const cacheStats = getCacheStats();
        console.log(`[Repo Analysis] 🚀 Starting analysis for ${owner}/${repo} (cache: ${cacheStats.memoryEntries} entries, redis: ${cacheStats.redisAvailable})`);

        // Create analysis run
        const analysisRef = adminDb.collection("analysis_runs").doc();
        await analysisRef.set({
            id: analysisRef.id,
            userId,
            projectId,
            commitSha: "full-repo-scan",
            branch,
            triggerType: "manual_full_scan",
            status: "running",
            issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
            createdAt: new Date(),
        });

        // Fetch repo tree
        const tree = await fetchRepoTree(githubToken, owner, repo, branch);
        const filesToAnalyze = tree.tree
            .filter(item => item.type === "blob" && shouldAnalyzeFile(item.path))
            .slice(0, MAX_FILES);

        console.log(`[Repo Analysis] 📂 Found ${filesToAnalyze.length} files to analyze (max ${MAX_FILES})`);

        const allIssues: Omit<CodeIssue, "id" | "analysisRunId" | "projectId" | "isMuted">[] = [];
        const analyzedFiles: string[] = [];
        const skippedFiles: string[] = [];
        const cachedFiles: string[] = [];
        const customRules = project.customRules || [];
        const token = githubToken; // Capture for closure

        // Process files in parallel batches with caching
        const { results, errors } = await processBatch(
            filesToAnalyze,
            async (file) => {
                // Fetch file content
                const content = await fetchFileContent(token, owner, repo, file.path, branch);

                // Skip large files
                if (content.length > 50000) {
                    return { path: file.path, issues: [], status: "skipped" as const };
                }

                const language = detectLanguage(file.path);

                // Check cache first
                const cacheKey = generateCacheKey(content, language, customRules);
                const cached = await getCachedAnalysis(cacheKey);
                if (cached) {
                    // Re-map filePath and cast to proper types
                    const remappedIssues = cached.issues.map(i => ({
                        ...i,
                        filePath: file.path,
                        severity: i.severity as IssueSeverity,
                        category: i.category as IssueCategory,
                    }));
                    return { path: file.path, issues: remappedIssues, status: "cached" as const };
                }

                // Analyze with AI
                const issues = await analyzeCode({
                    code: content,
                    filePath: file.path,
                    language,
                    commitMessage: "Full repository scan",
                    customRules,
                });

                // Store in cache
                await setCachedAnalysis(cacheKey, {
                    issues: issues as CachedAnalysisResult["issues"],
                    timestamp: Date.now(),
                    modelVersion: "gemini-2.5-flash-lite-v1",
                });

                return { path: file.path, issues, status: "analyzed" as const };
            },
            CONCURRENCY,
            (batchNum, totalBatches) => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`[Repo Analysis] ⚡ Batch ${batchNum}/${totalBatches} complete (${elapsed}s elapsed)`);
            }
        );

        // Collect results
        for (const result of results) {
            if (result.status === "skipped") {
                skippedFiles.push(result.path);
            } else {
                allIssues.push(...result.issues);
                analyzedFiles.push(result.path);
                if (result.status === "cached") {
                    cachedFiles.push(result.path);
                }
            }
        }

        for (const err of errors) {
            const file = filesToAnalyze[err.index];
            if (file) {
                console.warn(`[Repo Analysis] ❌ Failed: ${file.path}: ${err.error}`);
                skippedFiles.push(file.path);
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Repo Analysis] ✅ Done in ${elapsed}s — ${analyzedFiles.length} analyzed (${cachedFiles.length} cached), ${skippedFiles.length} skipped, ${allIssues.length} issues`);

        // Calculate counts
        const issueCounts: Record<IssueSeverity, number> = {
            critical: allIssues.filter(i => i.severity === "critical").length,
            high: allIssues.filter(i => i.severity === "high").length,
            medium: allIssues.filter(i => i.severity === "medium").length,
            low: allIssues.filter(i => i.severity === "low").length,
            info: allIssues.filter(i => i.severity === "info").length,
        };

        // Store issues
        const fullIssues: CodeIssue[] = allIssues.map((issue, idx) => ({
            ...issue,
            id: `${analysisRef.id}-${idx}`,
            analysisRunId: analysisRef.id,
            projectId,
            isMuted: false,
        }));

        if (fullIssues.length > 0) {
            const issuesBatch = adminDb.batch();
            for (const issue of fullIssues) {
                const issueRef = analysisRef.collection("issues").doc(issue.id);
                issuesBatch.set(issueRef, {
                    ...issue,
                    createdAt: new Date(),
                });
            }
            await issuesBatch.commit();
        }

        // Generate summary
        const summary = await generateAnalysisSummary({
            repoName: `${owner}/${repo}`,
            commitSha: "full-repo-scan",
            branch,
            issues: fullIssues,
        });

        // Update analysis run
        await analysisRef.update({
            status: "completed",
            completedAt: new Date(),
            issueCounts,
            summary,
            filesAnalyzed: analyzedFiles.length,
            filesSkipped: skippedFiles.length,
            filesCached: cachedFiles.length,
            analysisTimeMs: Date.now() - startTime,
        });

        return NextResponse.json({
            success: true,
            runId: analysisRef.id,
            filesAnalyzed: analyzedFiles.length,
            filesSkipped: skippedFiles.length,
            filesCached: cachedFiles.length,
            issuesFound: allIssues.length,
            issueCounts,
            analysisTimeMs: Date.now() - startTime,
        });

    } catch (error) {
        console.error("[Repo Analysis] Error:", error);
        return NextResponse.json(
            { error: "Failed to analyze repository" },
            { status: 500 }
        );
    }
}
