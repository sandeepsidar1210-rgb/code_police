import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  analyzeCode,
  detectLanguage,
  generateAnalysisSummary,
} from "@/lib/agents/code-police/analyzer";
import { sendAnalysisProgress } from "@/lib/agents/code-police/websocket";
import { sendAnalysisReport } from "@/lib/agents/code-police/email";
import { fetchCommit, fetchFileContent } from "@/lib/agents/code-police/github";
import { getUserEmail } from "@/lib/utils/clerk";
import type { CodeIssue, AnalysisRun, IssueSeverity, IssueCategory } from "@/types";
import type { DocumentData, QueryDocumentSnapshot, Firestore } from "firebase-admin/firestore";

/**
 * ============================================================================
 * CODE POLICE - ANALYZE ENDPOINT
 * ============================================================================
 * POST /api/code-police/analyze
 *
 * Analyzes code from a GitHub repository and optionally sends email report.
 */

// Helper to remove undefined values for Firestore
const sanitizeForFirestore = <T extends Record<string, unknown>>(obj: T): T => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
};

export async function POST(request: NextRequest) {
  let projectId: string | undefined = undefined;
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId: bodyProjectId,
      owner,
      repo,
      commitSha,
      sendEmail = false,
      recipientEmail,
    } = body;
    projectId = bodyProjectId;

    if (!projectId || !owner || !repo) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, owner, repo" },
        { status: 400 }
      );
    }

    // Get Firestore instance
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Get user's GitHub token from Clerk OAuth (primary) or Firestore (fallback)
    let githubToken: string | null = null;

    try {
      // Fetch GitHub OAuth token from Clerk
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
    } catch (tokenError) {
      console.error("[Analyze] Error fetching Clerk token:", tokenError);
    }

    // Fallback: Check if token was stored in user document (legacy)
    if (!githubToken) {
      const userDoc = await adminDb.collection("users").doc(userId).get();
      const userData = userDoc.data();
      githubToken = userData?.githubAccessToken || null;
    }

    if (!githubToken) {
      return NextResponse.json(
        {
          error: "GitHub token not found. Please reconnect GitHub in settings.",
        },
        { status: 400 }
      );
    }

    // Create analysis run record
    const analysisRef = adminDb.collection("analysis_runs").doc();
    const now = new Date();

    const analysisRun: Partial<AnalysisRun> = {
      id: analysisRef.id,
      userId,
      projectId,
      commitSha: commitSha || "latest",
      branch: "main",
      triggerType: "push",
      status: "running",
      issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    };

    await analysisRef.set({
      ...analysisRun,
      createdAt: now,
    });

    sendAnalysisProgress(projectId, {
      status: "Initializing analysis...",
      progress: 0,
      details: "Created analysis run record",
    });

    // Fetch commit details - if no SHA provided, get latest commit
    let commit;
    let actualCommitSha = commitSha;

    if (!commitSha || commitSha === "latest") {
      sendAnalysisProgress(projectId, {
        status: "Fetching repository details...",
        progress: 5,
        details: "Determining latest commit SHA",
      });
      console.log("[Analyze] No commit SHA provided, fetching latest commit from main branch...");
      // Fetch the list of commits to get the latest SHA
      const commitsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!commitsResponse.ok) {
        const errorData = await commitsResponse.json().catch(() => ({}));
        throw new Error(`Failed to fetch commits: ${commitsResponse.status} ${errorData.message || commitsResponse.statusText}`);
      }

      const commits = await commitsResponse.json();
      if (!commits || commits.length === 0) {
        throw new Error("No commits found in repository");
      }

      actualCommitSha = commits[0].sha;
      console.log("[Analyze] Using latest commit:", actualCommitSha);
    }

    sendAnalysisProgress(projectId, {
      status: "Fetching commit details...",
      progress: 10,
      details: `Fetching commit info for ${actualCommitSha || commitSha}`,
    });

    commit = await fetchCommit(githubToken, owner, repo, actualCommitSha);

    sendAnalysisProgress(projectId, {
      status: "Analyzing commit files...",
      progress: 18,
      details: `Commit retrieved. Processing files list.`,
    });

    // ========================================================================
    // FILE FILTERING - Exclude non-source files from analysis
    // ========================================================================

    // Patterns to exclude (directories and file patterns)
    const EXCLUDED_PATTERNS = [
      /^node_modules\//,
      /^\.git\//,
      /^dist\//,
      /^build\//,
      /^\.next\//,
      /^out\//,
      /^coverage\//,
      /^\.cache\//,
      /^vendor\//,
      /\.min\.(js|css)$/,
      /\.bundle\.(js|css)$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /bun\.lockb$/,
      /\.lock$/,
      /\.map$/,
      /\.d\.ts$/,
      /\.generated\./,
      /\.snap$/,
    ];

    // File extensions that are not source code
    const EXCLUDED_EXTENSIONS = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.bin', '.dat', '.db', '.sqlite',
    ];

    // Analyzable source file extensions
    const ANALYZABLE_EXTENSIONS = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
      '.c', '.cpp', '.h', '.hpp', '.cs',
      '.php', '.sql', '.sol',
      '.vue', '.svelte',
    ];

    /**
     * Check if a file should be analyzed
     */
    function shouldAnalyzeFile(filename: string): boolean {
      // Check excluded patterns
      for (const pattern of EXCLUDED_PATTERNS) {
        if (pattern.test(filename)) {
          console.log(`[Analyze] ⏭️ Skipping (pattern): ${filename}`);
          return false;
        }
      }

      // Check excluded extensions (binary/non-source files)
      const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
      if (EXCLUDED_EXTENSIONS.includes(ext)) {
        console.log(`[Analyze] ⏭️ Skipping (binary): ${filename}`);
        return false;
      }

      // Only analyze known source file extensions
      if (!ANALYZABLE_EXTENSIONS.includes(ext)) {
        console.log(`[Analyze] ⏭️ Skipping (unknown type): ${filename}`);
        return false;
      }

      return true;
    }

    // ========================================================================
    // PARALLEL ANALYSIS WITH CACHING
    // ========================================================================

    const CONCURRENCY = 5;
    const allIssues: Omit<CodeIssue, "id" | "analysisRunId" | "projectId" | "isMuted">[] = [];
    const analyzedFiles: string[] = [];
    const skippedFiles: string[] = [];
    const cachedFiles: string[] = [];

    // Ensure commit.files exists
    const commitFiles = commit.files || [];
    console.log(`[Analyze] Commit ${actualCommitSha}: ${commitFiles.length} files changed`);

    if (commitFiles.length === 0) {
      console.log(`[Analyze] ⚠️ No files in commit to analyze`);
    }

    // Filter files first
    const filesToProcess = commitFiles.filter(file => {
      if (file.status === "removed") return false;
      return shouldAnalyzeFile(file.filename);
    });

    const filesSkippedByFilter = commitFiles.length - filesToProcess.length;
    if (filesSkippedByFilter > 0) {
      console.log(`[Analyze] ⏭️ Skipped ${filesSkippedByFilter} files (removed/excluded)`);
    }

    sendAnalysisProgress(projectId, {
      status: "Preparing files...",
      progress: 22,
      details: `Found ${filesToProcess.length} analyzable files out of ${commitFiles.length} changed.`,
    });

    // Import cache utilities
    const { generateCacheKey, getCachedAnalysis, setCachedAnalysis, processBatch } = await import(
      "@/lib/agents/code-police/analysis-cache"
    );

    const token = githubToken; // Capture for closure

    const { results, errors } = await processBatch(
      filesToProcess,
      async (file) => {
        sendAnalysisProgress(projectId!, {
          status: `Analyzing: ${file.filename}`,
          progress: 25,
          details: `Processing file content and running AI reviewer`,
        });

        // Get file content
        const content = await fetchFileContent(
          token,
          owner,
          repo,
          file.filename,
          actualCommitSha
        );

        // Skip very large files (>50KB) to avoid token limits
        if (content.length > 50000) {
          return { filename: file.filename, issues: [], status: "skipped" as const };
        }

        const language = detectLanguage(file.filename);

        // Check cache
        const cacheKey = generateCacheKey(content, language);
        const cached = await getCachedAnalysis(cacheKey);
        if (cached) {
          const remappedIssues = cached.issues.map(i => ({
            filePath: file.filename,
            line: i.line,
            endLine: i.endLine,
            severity: i.severity as IssueSeverity,
            category: i.category as IssueCategory,
            message: i.message,
            explanation: i.explanation,
            suggestedFix: i.suggestedFix,
            ruleId: i.ruleId,
            codeSnippet: i.codeSnippet,
          }));
          return { filename: file.filename, issues: remappedIssues, status: "cached" as const };
        }

        console.log(`[Analyze] 🔍 Analyzing: ${file.filename} (${language})`);

        // Analyze the file
        const issues = await analyzeCode({
          code: content,
          filePath: file.filename,
          language,
          commitMessage: commit.commit.message,
        });

        // Store in cache
        await setCachedAnalysis(cacheKey, {
          issues: issues as import("@/lib/agents/code-police/analysis-cache").CachedAnalysisResult["issues"],
          timestamp: Date.now(),
          modelVersion: "gemini-2.5-flash-lite-v1",
        });

        return { filename: file.filename, issues, status: "analyzed" as const };
      },
      CONCURRENCY,
      (batchNum, totalBatches) => {
        console.log(`[Analyze] ⚡ Batch ${batchNum}/${totalBatches} complete`);
        const percent = 30 + Math.round((batchNum / totalBatches) * 50);
        sendAnalysisProgress(projectId!, {
          status: `Analyzing files (Batch ${batchNum}/${totalBatches})...`,
          progress: percent,
          details: `Completed batch ${batchNum} of ${totalBatches}`,
        });
      }
    );

    // Collect results
    for (const result of results) {
      if (result.status === "skipped") {
        skippedFiles.push(result.filename);
        console.log(`[Analyze] ⏭️ Skipping (too large): ${result.filename}`);
      } else {
        allIssues.push(...result.issues);
        analyzedFiles.push(result.filename);
        if (result.status === "cached") {
          cachedFiles.push(result.filename);
        }
      }
    }

    for (const err of errors) {
      const file = filesToProcess[err.index];
      if (file) {
        console.warn(`[Analyze] ❌ Failed to analyze ${file.filename}:`, err.error);
        skippedFiles.push(file.filename);
      }
    }

    console.log(`[Analyze] ✅ Analyzed ${analyzedFiles.length} files, skipped ${skippedFiles.length} files`);
    console.log(`[Analyze] 📊 Found ${allIssues.length} total issues`);

    // Calculate issue counts
    const issueCounts: Record<IssueSeverity, number> = {
      critical: allIssues.filter((i) => i.severity === "critical").length,
      high: allIssues.filter((i) => i.severity === "high").length,
      medium: allIssues.filter((i) => i.severity === "medium").length,
      low: allIssues.filter((i) => i.severity === "low").length,
      info: allIssues.filter((i) => i.severity === "info").length,
    };

    // Store issues in Firestore
    const fullIssues: CodeIssue[] = allIssues.map((issue, idx) => ({
      ...issue,
      id: `${analysisRef.id}-${idx}`,
      analysisRunId: analysisRef.id,
      projectId: projectId!,
      isMuted: false,
    }));

    // Add issues to subcollection
    const batch = adminDb.batch();
    for (const issue of fullIssues) {
      const issueRef = analysisRef.collection("issues").doc(issue.id);
      batch.set(issueRef, sanitizeForFirestore(issue as unknown as Record<string, unknown>));
    }

    // Generate summary
    sendAnalysisProgress(projectId, {
      status: "Generating summary...",
      progress: 85,
      details: "Generating AI review summary",
    });

    const summary = await generateAnalysisSummary({
      repoName: `${owner}/${repo}`,
      commitSha: actualCommitSha,
      branch: "main",
      issues: fullIssues,
    });

    // Update analysis run with results
    sendAnalysisProgress(projectId, {
      status: "Saving results...",
      progress: 90,
      details: `Saving ${fullIssues.length} issues to database`,
    });

    batch.update(analysisRef, {
      status: "completed",
      completedAt: new Date(),
      issueCounts,
      summary,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
      },
    });

    await batch.commit();

    // Send email if requested
    if (sendEmail) {
      try {
        // Get email from Clerk first (works for Google and GitHub auth)
        const emailInfo = await getUserEmail(userId);
        let emailTo = recipientEmail || emailInfo.email;

        // Fallback: check Firestore for legacy users
        if (!emailTo) {
          const userDoc = await adminDb.collection("users").doc(userId).get();
          emailTo = userDoc.data()?.email;
        }

        if (!emailTo) {
          console.warn("No email address available for notification");
        } else {
          sendAnalysisProgress(projectId, {
            status: "Sending notifications...",
            progress: 95,
            details: `Sending email report to ${emailTo}`,
          });

          await sendAnalysisReport({
            to: emailTo,
            run: {
              ...analysisRun,
              issueCounts,
              author: {
                name: commit.commit.author.name,
                email: commit.commit.author.email,
              },
            } as AnalysisRun,
            issues: fullIssues,
            summary,
            repoName: `${owner}/${repo}`,
            commitUrl: `https://github.com/${owner}/${repo}/commit/${actualCommitSha}`,
          });

          await analysisRef.update({ emailStatus: "sent", emailSentTo: emailTo });
          console.log(`[Analysis] Email sent to ${emailTo}`);
        }
      } catch (error) {
        console.error("Failed to send email report:", error);
        await analysisRef.update({ emailStatus: "failed" });
      }
    }

    // Update project last analyzed timestamp
    await adminDb.collection("projects").doc(projectId).update({
      updatedAt: new Date(),
    });

    sendAnalysisProgress(projectId, {
      status: "Analysis complete!",
      progress: 100,
      details: `Analysis finished successfully. Found ${fullIssues.length} issues.`,
    });

    return NextResponse.json({
      success: true,
      analysisId: analysisRef.id,
      summary: issueCounts,
      issueCount: fullIssues.length,
      report: summary,
    });
  } catch (error) {
    console.error("[Analyze] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Analyze] Stack:", errorStack);

    // Try to broadcast the error
    if (projectId) {
      sendAnalysisProgress(projectId, {
        status: "Analysis failed",
        progress: 100,
        details: `Error: ${errorMessage}`,
      });
    }

    return NextResponse.json(
      {
        error: "Failed to analyze code",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/code-police/analyze
 *
 * Fetches analysis history for a project.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId parameter" },
        { status: 400 }
      );
    }

    // Get Firestore instance
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch analysis runs for project
    const runsSnapshot = await adminDb
      .collection("analysis_runs")
      .where("projectId", "==", projectId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const runs = runsSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
      completedAt: doc.data().completedAt?.toDate?.() || doc.data().completedAt,
    }));

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Fetch analysis history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysis history" },
      { status: 500 }
    );
  }
}
