import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  analyzeCode,
  detectLanguage,
  generateAnalysisSummary,
} from "@/lib/agents/code-police/analyzer";
import { sendAnalysisProgress } from "@/lib/agents/code-police/websocket";
import { sendAnalysisReport } from "@/lib/agents/code-police/email";
import { generateAndCreateFixPR } from "@/lib/agents/code-police/auto-fix";
import { fetchCommit, fetchFileContent, postPRComment, formatPRComment, getDependentFiles } from "@/lib/agents/code-police/github";
import { analyzePrImpact } from "@/lib/agents/code-police/pr-impact";
import { resolveApiKey, type ByokConfig } from "@/lib/agents/code-police/byok";
import { getUserEmail } from "@/lib/utils/clerk";
import { notifyCodeAnalysisComplete, notifyAutoFixPRCreated } from "@/lib/notifications";
import { checkLimit, incrementUsage } from "@/lib/usage";
import type { CodeIssue, IssueSeverity, ProjectStatus } from "@/types";

/**
 * ============================================================================
 * GITHUB WEBHOOK HANDLER
 * ============================================================================
 * POST /api/webhooks/github
 * 
 * Handles push and pull_request events from GitHub.
 */

interface GitHubPushPayload {
  ref: string;
  after: string;
  before: string;
  repository: {
    id: number;
    full_name: string;
    owner: { login: string };
    name: string;
  };
  pusher: { name: string; email: string };
  commits: Array<{
    id: string;
    message: string;
    author: { name: string; email: string };
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

interface GitHubPRPayload {
  action: string;
  number: number;
  pull_request: {
    head: { sha: string; ref: string };
    base: { ref: string };
    title: string;
    user: { login: string; avatar_url: string };
  };
  repository: {
    id: number;
    full_name: string;
    owner: { login: string };
    name: string;
  };
}

/**
 * Verify GitHub webhook signature
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  try {
    console.log("[GitHub Webhook] Received webhook event");

    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const delivery = request.headers.get("x-github-delivery");

    console.log("[GitHub Webhook] Event type:", event);
    console.log("[GitHub Webhook] Delivery ID:", delivery);

    if (!event) {
      console.error("[GitHub Webhook] Missing event header");
      return NextResponse.json({ error: "Missing event header" }, { status: 400 });
    }

    // Parse the payload
    const payload = JSON.parse(rawBody);
    const repoId = payload.repository?.id;
    const repoFullName = payload.repository?.full_name;

    console.log("[GitHub Webhook] Repository:", repoFullName, "ID:", repoId);

    if (!repoId) {
      console.error("[GitHub Webhook] Invalid payload - no repository ID");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Get Firestore instance
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.error("[GitHub Webhook] Database not configured");
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Find project by repo ID
    const projectsSnapshot = await adminDb
      .collection("projects")
      .where("githubRepoId", "==", repoId)
      .limit(1)
      .get();

    if (projectsSnapshot.empty) {
      console.error("[GitHub Webhook] Project not found for repo ID:", repoId);
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectDoc = projectsSnapshot.docs[0];
    const project = { id: projectDoc.id, ...projectDoc.data() } as {
      id: string;
      userId: string;
      webhookSecret?: string;
      status?: ProjectStatus;
      customRules?: string[];
      ownerEmail?: string;
      notificationPrefs?: { emailOnPush?: boolean; additionalEmails?: string[] };
      [key: string]: unknown;
    };

    console.log("[GitHub Webhook] Found project:", project.id, "Status:", project.status);

    // Check project status (Vercel-style controls)
    const projectStatus = project.status || 'active';
    if (projectStatus === 'paused') {
      console.log(`[GitHub Webhook] Project ${project.id} is paused, skipping analysis`);
      return NextResponse.json({ message: 'Project paused, skipping analysis' });
    }
    if (projectStatus === 'stopped') {
      console.log(`[GitHub Webhook] Project ${project.id} is stopped`);
      return NextResponse.json({ error: 'Project stopped' }, { status: 404 });
    }

    // Verify signature
    const webhookSecret = project.webhookSecret;
    if (webhookSecret && !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error("[GitHub Webhook] Invalid signature for project:", project.id);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    console.log("[GitHub Webhook] Signature verified successfully");

    // Get user's GitHub token from Clerk (OAuth tokens are stored in Clerk, not Firestore)
    let githubToken: string | null = null;

    try {
      // Fetch GitHub OAuth token from Clerk
      const clerkResponse = await fetch(
        `https://api.clerk.com/v1/users/${project.userId}/oauth_access_tokens/oauth_github`,
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
      console.error("[GitHub Webhook] Error fetching Clerk token:", tokenError);
    }

    // Fallback: Check if token was stored in user document (legacy)
    if (!githubToken) {
      const userDoc = await adminDb.collection("users").doc(project.userId as string).get();
      githubToken = userDoc.data()?.githubAccessToken || null;
    }

    if (!githubToken) {
      console.error("[GitHub Webhook] No GitHub token found for user:", project.userId);
      return NextResponse.json({ error: "No GitHub token - please reconnect your GitHub account" }, { status: 400 });
    }

    console.log("[GitHub Webhook] GitHub token obtained successfully");
    console.log("[GitHub Webhook] Processing event:", event);

    // Handle different events
    if (event === "push") {
      console.log("[GitHub Webhook] Handling push event");
      await handlePushEvent(
        payload as GitHubPushPayload,
        project as { id: string; userId: string;[key: string]: unknown },
        githubToken
      );
    } else if (event === "pull_request") {
      const prPayload = payload as GitHubPRPayload;
      console.log("[GitHub Webhook] Handling PR event, action:", prPayload.action);
      if (["opened", "synchronize"].includes(prPayload.action)) {
        await handlePREvent(
          prPayload,
          project as { id: string; userId: string;[key: string]: unknown },
          githubToken
        );
      }
    } else {
      console.log("[GitHub Webhook] Unhandled event type:", event);
    }

    console.log("[GitHub Webhook] Webhook processed successfully");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GitHub Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

/**
 * Handle push event - analyze new commits
 */
async function handlePushEvent(
  payload: GitHubPushPayload,
  project: { id: string; userId: string;[key: string]: unknown },
  githubToken: string
) {
  const { repository, after: commitSha, commits } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;
  const branch = payload.ref.replace("refs/heads/", "");

  console.log("[Push Event] Starting analysis for:", `${owner}/${repo}`, "Branch:", branch);
  console.log("[Push Event] Commit:", commitSha);
  console.log("[Push Event] Number of commits:", commits?.length || 0);

  // Get Firestore instance
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("[Push Event] Database not configured");
    return;
  }

  // ========================================================================
  // DEDUPLICATION CHECK - Prevent duplicate analysis of the same commit
  // ========================================================================
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const existingAnalysis = await adminDb
    .collection("analysis_runs")
    .where("projectId", "==", project.id)
    .where("commitSha", "==", commitSha)
    .where("createdAt", ">=", fiveMinutesAgo)
    .limit(1)
    .get();

  if (!existingAnalysis.empty) {
    const existingRun = existingAnalysis.docs[0].data();
    console.log("[Push Event] DUPLICATE DETECTED - Commit already analyzed recently");
    console.log("[Push Event] Existing analysis ID:", existingRun.id, "Status:", existingRun.status);
    console.log("[Push Event] Skipping duplicate analysis for commit:", commitSha.slice(0, 7));
    return;
  }

  // ========================================================================
  // USAGE LIMIT CHECK - Check if user has remaining push analyses
  // ========================================================================
  const userId = project.userId as string;
  const limitCheck = await checkLimit(userId, "pushAnalyses");
  if (!limitCheck.allowed) {
    console.log("[Push Event] LIMIT REACHED - User has used all push analyses");
    console.log("[Push Event] Current:", limitCheck.current, "Limit:", limitCheck.limit);
    console.log("[Push Event] Skipping analysis - upgrade required");
    return;
  }

  // Create analysis run
  const analysisRef = adminDb.collection("analysis_runs").doc();

  console.log("[Push Event] Creating analysis run:", analysisRef.id);

  await analysisRef.set({
    id: analysisRef.id,
    userId: project.userId,
    projectId: project.id,
    commitSha,
    branch,
    triggerType: "push",
    status: "running",
    issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    createdAt: new Date(),
  });

  sendAnalysisProgress(project.id, {
    status: "Initializing webhook analysis...",
    progress: 0,
    details: `Created analysis run ${analysisRef.id} for branch ${branch}`,
  });

  try {
    sendAnalysisProgress(project.id, {
      status: "Fetching commit details...",
      progress: 10,
      details: `Fetching commit info for ${commitSha.slice(0, 7)}`,
    });

    console.log("[Push Event] Fetching commit details...");
    // Fetch commit and analyze
    const commit = await fetchCommit(githubToken, owner, repo, commitSha);
    const commitFiles = commit.files || [];

    sendAnalysisProgress(project.id, {
      status: "Analyzing commit files...",
      progress: 18,
      details: `Retrieved commit. Parsing ${commitFiles.length} files.`,
    });
    console.log("[Push Event] Commit has", commitFiles.length, "files changed");

    // ========================================================================
    // FILE FILTERING - Same as analyze route
    // ========================================================================
    const EXCLUDED_PATTERNS = [
      /^node_modules\//,
      /^\.git\//,
      /^dist\//,
      /^build\//,
      /^\.next\//,
      /^out\//,
      /^coverage\//,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.min\.(js|css)$/,
      /\.map$/,
      /\.d\.ts$/,
    ];

    const ANALYZABLE_EXTENSIONS = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
      '.c', '.cpp', '.h', '.hpp', '.cs',
      '.php', '.sql', '.sol', '.vue', '.svelte',
    ];

    function shouldAnalyzeFile(filename: string): boolean {
      for (const pattern of EXCLUDED_PATTERNS) {
        if (pattern.test(filename)) return false;
      }
      const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
      return ANALYZABLE_EXTENSIONS.includes(ext);
    }

    const allIssues: Omit<CodeIssue, "id" | "analysisRunId" | "projectId" | "isMuted">[] = [];
    const analyzedFiles: string[] = [];
    const skippedFiles: string[] = [];

    const customRules = (project.customRules as string[] | undefined) || [];

    // Resolve BYOK key (project-level, then platform default).
    const { apiKey: byokKey, source: keySource } = resolveApiKey({
      projectByok: (project.byok as ByokConfig | undefined) || null,
    });
    console.log(`[Push Event] Using ${keySource} API key`);

    const analyzableFiles = commitFiles.filter(file => file.status !== "removed" && shouldAnalyzeFile(file.filename));
    
    sendAnalysisProgress(project.id, {
      status: "Filtering files...",
      progress: 22,
      details: `Found ${analyzableFiles.length} files to analyze.`,
    });

    let analyzedCount = 0;
    for (const file of commitFiles) {
      if (file.status === "removed") {
        console.log("[Push Event] Skipping removed file:", file.filename);
        continue;
      }

      // Apply file filtering
      if (!shouldAnalyzeFile(file.filename)) {
        console.log("[Push Event] Skipping (filtered):", file.filename);
        skippedFiles.push(file.filename);
        continue;
      }

      analyzedCount++;
      const currentPercent = 25 + Math.round((analyzedCount / Math.max(1, analyzableFiles.length)) * 55); // Scales from 25% to 80%

      sendAnalysisProgress(project.id, {
        status: `Analyzing: ${file.filename}`,
        progress: currentPercent,
        details: `Analyzing file ${analyzedCount} of ${analyzableFiles.length}`,
      });

      console.log("[Push Event] Analyzing file:", file.filename);

      try {
        const content = await fetchFileContent(githubToken, owner, repo, file.filename, commitSha);

        // Skip large files
        if (content.length > 50000) {
          console.log("[Push Event] Skipping (too large):", file.filename);
          skippedFiles.push(file.filename);
          continue;
        }

        const language = detectLanguage(file.filename);

        // Get dependent files for graph-aware analysis (optional, may fail due to rate limits)
        let dependentContext = '';
        try {
          const dependentFiles = await getDependentFiles(githubToken, owner, repo, file.filename);
          if (dependentFiles.length > 0) {
            dependentContext = dependentFiles
              .map(df => `- ${df.path}:\n${df.snippet}`)
              .join('\n\n');
          }
        } catch (err) {
          console.warn("Graph-aware analysis skipped:", err);
        }

        const issues = await analyzeCode({
          code: content,
          filePath: file.filename,
          language,
          commitMessage: commit.commit.message,
          customRules,
          dependentContext: dependentContext || undefined,
          apiKey: byokKey,
        });

        allIssues.push(...issues);
        analyzedFiles.push(file.filename);
      } catch (fileError) {
        console.warn("[Push Event] Failed to analyze file:", file.filename, fileError);
        skippedFiles.push(file.filename);
      }
    }

    console.log(`[Push Event] Analyzed ${analyzedFiles.length} files, skipped ${skippedFiles.length}`);

    // Calculate counts
    const issueCounts: Record<IssueSeverity, number> = {
      critical: allIssues.filter((i) => i.severity === "critical").length,
      high: allIssues.filter((i) => i.severity === "high").length,
      medium: allIssues.filter((i) => i.severity === "medium").length,
      low: allIssues.filter((i) => i.severity === "low").length,
      info: allIssues.filter((i) => i.severity === "info").length,
    };

    console.log("[Push Event] Issue counts:", issueCounts);
    console.log("[Push Event] Total issues found:", allIssues.length);

    // Store issues in Firestore SUBCOLLECTION (matching the GET API)
    const fullIssues: CodeIssue[] = allIssues.map((issue, idx) => ({
      ...issue,
      id: `${analysisRef.id}-${idx}`,
      analysisRunId: analysisRef.id,
      projectId: project.id,
      isMuted: false,
    }));

    // Helper function to remove undefined values from objects (Firestore doesn't accept undefined)
    const sanitizeForFirestore = (obj: Record<string, unknown>): Record<string, unknown> => {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            cleaned[key] = sanitizeForFirestore(value as Record<string, unknown>);
          } else {
            cleaned[key] = value;
          }
        }
      }
      return cleaned;
    };

    // Store in SUBCOLLECTION: analysis_runs/{runId}/issues
    if (fullIssues.length > 0) {
      sendAnalysisProgress(project.id, {
        status: "Saving results...",
        progress: 90,
        details: `Writing ${fullIssues.length} issues to database`,
      });

      const issuesBatch = adminDb.batch();
      for (const issue of fullIssues) {
        // FIX: Store in subcollection, not top-level collection
        const issueRef = analysisRef.collection("issues").doc(issue.id);
        // Sanitize to remove undefined values
        const sanitizedIssue = sanitizeForFirestore({
          ...issue,
          createdAt: new Date(),
          // Ensure optional fields have defaults
          endLine: issue.endLine ?? issue.line,
        });
        issuesBatch.set(issueRef, sanitizedIssue);
      }
      await issuesBatch.commit();
      console.log("[Push Event] Stored", fullIssues.length, "issues in subcollection");
    }

    // Generate summary
    sendAnalysisProgress(project.id, {
      status: "Generating summary...",
      progress: 92,
      details: "Generating AI review summary",
    });

    const summary = await generateAnalysisSummary({
      repoName: `${owner}/${repo}`,
      commitSha,
      branch,
      issues: fullIssues,
    });

    // Update analysis run
    await analysisRef.update({
      status: "completed",
      completedAt: new Date(),
      issueCounts,
      summary,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
      },
    });

    // Increment usage counter for push analyses
    await incrementUsage(userId, "pushAnalyses");

    // Send email notification if configured
    const notificationPrefs = project.notificationPrefs as { emailOnPush?: boolean; additionalEmails?: string[] } | undefined;
    console.log("[Push Event] Notification prefs:", JSON.stringify(notificationPrefs));
    console.log("[Push Event] emailOnPush enabled:", notificationPrefs?.emailOnPush);

    if (notificationPrefs?.emailOnPush) {
      // Get user email from Clerk first (works for Google and GitHub auth)
      const emailInfo = await getUserEmail(project.userId);
      console.log("[Push Event] Email info from Clerk:", JSON.stringify(emailInfo));
      let userEmail = emailInfo.email;

      // Fallback: check Firestore for legacy users
      if (!userEmail) {
        const userData = await adminDb.collection("users").doc(project.userId).get();
        userEmail = userData.data()?.email;
        console.log("[Push Event] Email from Firestore fallback:", userEmail);
      }

      const recipients = [userEmail, ...(notificationPrefs.additionalEmails || [])].filter((e): e is string => !!e);
      console.log("[Push Event] Email recipients:", recipients);

      if (recipients.length === 0) {
        console.warn("[Push Event] No email recipients found, skipping email");
      }

      sendAnalysisProgress(project.id, {
        status: "Sending notifications...",
        progress: 95,
        details: "Sending email reports to configured recipients",
      });

      for (const email of recipients) {
        console.log("[Push Event] Sending email to:", email);
        const emailResult = await sendAnalysisReport({
          to: email,
          run: {
            id: analysisRef.id,
            userId: project.userId,
            projectId: project.id,
            commitSha,
            branch,
            triggerType: "push",
            status: "completed",
            issueCounts,
            author: {
              name: commit.commit.author.name,
              email: commit.commit.author.email,
            },
          } as import("@/types").AnalysisRun,
          issues: fullIssues,
          summary,
          repoName: `${owner}/${repo}`,
          commitUrl: `https://github.com/${owner}/${repo}/commit/${commitSha}`,
        });
        console.log("[Push Event] Email send result:", JSON.stringify(emailResult));
      }

      await analysisRef.update({ emailStatus: "sent" });
    } else {
      console.log("[Push Event] Email notifications disabled for this project");
    }

    // Create in-app notification for analysis completion
    await notifyCodeAnalysisComplete(
      project.userId,
      `${owner}/${repo}`,
      issueCounts,
      analysisRef.id
    );

    // Auto-fix: Generate fixes and create PR if enabled
    if ((project.autoFixEnabled as boolean | undefined) && fullIssues.length > 0) {
      sendAnalysisProgress(project.id, {
        status: "Running Auto-fix...",
        progress: 98,
        details: "Generating automatic PR fixes for detected issues",
      });

      console.log("[Push Event] Auto-fix enabled, generating fixes...");

      try {
        const autoFixResult = await generateAndCreateFixPR({
          githubToken,
          owner,
          repo,
          branch,
          commitSha,
          issues: fullIssues,
          analysisRunId: analysisRef.id,
          severityFilter: ["critical", "high", "medium"],
        });

        if (autoFixResult.success) {
          console.log(`[Push Event] Auto-fix PR created: ${autoFixResult.prUrl}`);
          await analysisRef.update({
            autoFixPrUrl: autoFixResult.prUrl,
            autoFixPrNumber: autoFixResult.prNumber,
            autoFixBranch: autoFixResult.branchName,
            autoFixesGenerated: autoFixResult.fixesGenerated,
            autoFixFilesChanged: autoFixResult.filesChanged,
          });

          // Create in-app notification for auto-fix PR
          await notifyAutoFixPRCreated(
            project.userId,
            `${owner}/${repo}`,
            autoFixResult.prNumber!,
            autoFixResult.prUrl!,
            autoFixResult.fixesGenerated
          );
        } else {
          console.log(`[Push Event] Auto-fix did not create PR: ${autoFixResult.error}`);
          if (autoFixResult.fixesGenerated > 0) {
            await analysisRef.update({
              autoFixAttempted: true,
              autoFixError: autoFixResult.error,
              autoFixesGenerated: autoFixResult.fixesGenerated,
            });
          }
        }
      } catch (autoFixError) {
        console.error("[Push Event] Auto-fix error:", autoFixError);
        await analysisRef.update({
          autoFixAttempted: true,
          autoFixError: autoFixError instanceof Error ? autoFixError.message : "Auto-fix failed",
        });
      }
    }

    sendAnalysisProgress(project.id, {
      status: "Analysis complete!",
      progress: 100,
      details: `Analysis finished successfully. Found ${fullIssues.length} issues.`,
    });
  } catch (error) {
    console.error("Push event analysis failed:", error);
    
    sendAnalysisProgress(project.id, {
      status: "Analysis failed",
      progress: 100,
      details: `Error: ${error instanceof Error ? error.message : "Webhook analysis failed"}`,
    });

    await analysisRef.update({
      status: "failed",
      error: error instanceof Error ? error.message : "Analysis failed",
    });
  }
}

/**
 * Handle PR event - analyze PR changes
 */
async function handlePREvent(
  payload: GitHubPRPayload,
  project: { id: string; userId: string;[key: string]: unknown },
  githubToken: string
) {
  const { repository, pull_request: pr } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;
  const commitSha = pr.head.sha;
  const branch = pr.head.ref;

  // Get Firestore instance
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("[GitHub Webhook] Database not configured");
    return;
  }

  // Create analysis run
  const analysisRef = adminDb.collection("analysis_runs").doc();

  await analysisRef.set({
    id: analysisRef.id,
    userId: project.userId,
    projectId: project.id,
    commitSha,
    branch,
    triggerType: "pull_request",
    prNumber: payload.number,
    status: "running",
    issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    createdAt: new Date(),
    author: {
      name: pr.user.login,
      avatar: pr.user.avatar_url,
    },
  });

  try {
    // Similar analysis as push event but with PR comment output
    const commit = await fetchCommit(githubToken, owner, repo, commitSha);
    const commitFiles = commit.files || [];

    // File filtering (same as push event)
    const EXCLUDED_PATTERNS = [/^node_modules\//, /^\.git\//, /^dist\//, /^build\//, /^\.next\//, /package-lock\.json$/, /yarn\.lock$/, /\.min\.(js|css)$/, /\.map$/, /\.d\.ts$/];
    const ANALYZABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.vue', '.svelte'];
    function shouldAnalyzeFile(filename: string): boolean {
      for (const pattern of EXCLUDED_PATTERNS) {
        if (pattern.test(filename)) return false;
      }
      const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
      return ANALYZABLE_EXTENSIONS.includes(ext);
    }

    const allIssues: Omit<CodeIssue, "id" | "analysisRunId" | "projectId" | "isMuted">[] = [];

    // Get custom rules from project settings
    const customRules = (project.customRules as string[] | undefined) || [];

    // Resolve BYOK key (project-level, then platform default).
    const { apiKey: byokKey } = resolveApiKey({
      projectByok: (project.byok as ByokConfig | undefined) || null,
    });

    for (const file of commitFiles) {
      if (file.status === "removed") continue;
      if (!shouldAnalyzeFile(file.filename)) continue;

      try {
        const content = await fetchFileContent(githubToken, owner, repo, file.filename, commitSha);
        if (content.length > 50000) continue; // Skip large files

        const language = detectLanguage(file.filename);

        // Get dependent files for graph-aware analysis
        let dependentContext = '';
        try {
          const dependentFiles = await getDependentFiles(githubToken, owner, repo, file.filename);
          if (dependentFiles.length > 0) {
            dependentContext = dependentFiles
              .map(df => `- ${df.path}:\n${df.snippet}`)
              .join('\n\n');
          }
        } catch (err) {
          console.warn("Graph-aware analysis skipped:", err);
        }

        const issues = await analyzeCode({
          code: content,
          filePath: file.filename,
          language,
          commitMessage: pr.title,
          customRules,
          dependentContext: dependentContext || undefined,
          apiKey: byokKey,
        });

        allIssues.push(...issues);
      } catch (fileError) {
        console.warn("[PR Event] Failed to analyze file:", file.filename);
      }
    }

    const issueCounts: Record<IssueSeverity, number> = {
      critical: allIssues.filter((i) => i.severity === "critical").length,
      high: allIssues.filter((i) => i.severity === "high").length,
      medium: allIssues.filter((i) => i.severity === "medium").length,
      low: allIssues.filter((i) => i.severity === "low").length,
      info: allIssues.filter((i) => i.severity === "info").length,
    };

    console.log("[PR Event] Issue counts:", issueCounts);
    console.log("[PR Event] Total issues found:", allIssues.length);

    const fullIssues: CodeIssue[] = allIssues.map((issue, idx) => ({
      ...issue,
      id: `${analysisRef.id}-${idx}`,
      analysisRunId: analysisRef.id,
      projectId: project.id,
      isMuted: false,
    }));

    // Store issues in SUBCOLLECTION (matching GET API)
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
      console.log("[PR Event] Stored", fullIssues.length, "issues in subcollection");
    }

    const summary = await generateAnalysisSummary({
      repoName: `${owner}/${repo}`,
      commitSha,
      branch,
      issues: fullIssues,
    });

    // ========================================================================
    // DEPENDENCY IMPACT + MERGE-CONFLICT PRE-CHECK (OSS maintainer feature)
    // ========================================================================
    // Build a real dependency graph for the repo and compute the PR's blast
    // radius: which files this PR changes and which others are affected. Also
    // pre-detect likely merge conflicts so maintainers know before merging.
    let impactComment = "";
    try {
      const changedFiles = commitFiles
        .filter((f) => f.status !== "removed")
        .map((f) => f.filename);

      const impactResult = await analyzePrImpact({
        githubToken,
        owner,
        repo,
        branch,
        baseBranch: payload.pull_request.base.ref,
        prNumber: payload.number,
        changedFiles,
        includeConflicts: true,
      });

      impactComment = impactResult.comment;

      // Persist a compact impact summary for the dashboard UI.
      await analysisRef.update({
        impact: {
          riskScore: impactResult.impact.riskScore,
          riskLevel: impactResult.impact.riskLevel,
          changedFiles: impactResult.impact.changedFiles,
          affectedFiles: impactResult.impact.affectedFiles.slice(0, 50),
          directDependents: impactResult.impact.directDependents,
          edges: impactResult.impact.edges.slice(0, 100),
          mergeable: impactResult.conflicts?.mergeable ?? null,
          conflictRisk: impactResult.conflicts?.riskLevel ?? "none",
          likelyConflicts: (impactResult.conflicts?.likelyConflicts ?? []).map((c) => c.path),
        },
      });
    } catch (impactError) {
      console.warn("[PR Event] Impact analysis failed:", impactError);
    }

    await analysisRef.update({
      status: "completed",
      completedAt: new Date(),
      issueCounts,
      summary,
    });

    // Post PR comment (not email) for pull requests — issues + impact graph.
    try {
      const commentBody = [formatPRComment(fullIssues, commitSha), impactComment]
        .filter(Boolean)
        .join("\n\n---\n\n");
      await postPRComment(githubToken, owner, repo, payload.number, commentBody);
      console.log(`[Webhook] Posted PR comment for PR #${payload.number}`);
    } catch (commentError) {
      console.error("Failed to post PR comment:", commentError);
    }

  } catch (error) {
    console.error("PR event analysis failed:", error);
    await analysisRef.update({
      status: "failed",
      error: error instanceof Error ? error.message : "Analysis failed",
    });
  }
}

// Keep reference to userDoc for email sending in handlePushEvent
// Note: This is resolved by fetching user data within each handler function
