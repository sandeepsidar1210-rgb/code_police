import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Octokit } from "@octokit/rest";
import { getAdminDb } from "@/lib/firebase/admin";
import { notifyRepoConnected } from "@/lib/notifications";
import crypto from "crypto";

/**
 * POST /api/github/connect
 * Connect a GitHub repository by setting up a webhook
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { repoId, owner, name, fullName } = body;

    if (!repoId || !owner || !name) {
      return NextResponse.json(
        { error: "Missing required fields: repoId, owner, name" },
        { status: 400 }
      );
    }

    // Get GitHub OAuth token from Clerk
    const clerk = await clerkClient();
    let githubToken: string | null = null;

    try {
      const tokens = await clerk.users.getUserOauthAccessToken(userId, "oauth_github");
      if (tokens.data && tokens.data.length > 0) {
        githubToken = tokens.data[0].token;
      }
    } catch (error) {
      console.log("No GitHub OAuth token found:", error);
      return NextResponse.json(
        { error: "GitHub not connected properly" },
        { status: 401 }
      );
    }

    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub OAuth token not found" },
        { status: 401 }
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

    // Check if project already exists
    const existingProject = await adminDb
      .collection("projects")
      .where("githubRepoId", "==", repoId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!existingProject.empty) {
      return NextResponse.json(
        { error: "Repository already connected" },
        { status: 409 }
      );
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString("hex");
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://protocolzero.dev"}/api/webhooks/github`;

    // Create webhook on GitHub
    const octokit = new Octokit({ auth: githubToken });

    let webhookId: number | null = null;
    try {
      const webhook = await octokit.repos.createWebhook({
        owner,
        repo: name,
        config: {
          url: webhookUrl,
          content_type: "json",
          secret: webhookSecret,
        },
        events: ["push", "pull_request"],
        active: true,
      });
      webhookId = webhook.data.id;
    } catch (webhookError) {
      console.error("Failed to create webhook:", webhookError);
      // Continue without webhook - user can add manually
      console.warn("[GitHub Connect] Webhook creation failed, continuing without webhook");
    }

    // Get repo details
    const { data: repoDetails } = await octokit.repos.get({ owner, repo: name });

    // Ensure repoId is stored as a number for consistent querying
    const numericRepoId = typeof repoId === 'string' ? parseInt(repoId, 10) : repoId;

    // Create project in Firestore
    const projectRef = adminDb.collection("projects").doc();
    const project = {
      id: projectRef.id,
      userId,
      name,
      githubRepoId: numericRepoId,  // Always store as number
      githubFullName: fullName || `${owner}/${name}`,
      githubOwner: owner,
      githubRepoName: name,
      defaultBranch: repoDetails.default_branch,
      language: repoDetails.language || null,
      webhookId,
      webhookSecret,
      webhookUrl,
      status: 'active' as const,  // Vercel-style status
      isActive: true,
      rulesProfile: {
        strictness: "moderate",
        categories: {
          security: true,
          performance: true,
          readability: true,
          bugs: true,
        },
      },
      notificationPrefs: {
        emailOnPush: true,
        emailOnPR: true,
        minSeverity: "medium",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await projectRef.set(project);

    // Also update the user document with GitHub connection info (optional but useful)
    try {
      const userRef = adminDb.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.update({
          githubConnected: true,
          githubUsername: owner,
          updatedAt: new Date(),
        });
      }
    } catch (userUpdateError) {
      console.warn("[GitHub Connect] Could not update user document:", userUpdateError);
    }

    console.log("[GitHub Connect] Successfully connected repository:", project.githubFullName);
    console.log("[GitHub Connect] Webhook URL:", webhookUrl);
    console.log("[GitHub Connect] Webhook ID:", webhookId);

    // Create in-app notification for repo connection
    await notifyRepoConnected(userId, project.githubFullName, project.id);

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        githubFullName: project.githubFullName,
        webhookConfigured: !!webhookId,
        webhookUrl: webhookUrl,
      },
    });
  } catch (error) {
    console.error("Error connecting repository:", error);
    return NextResponse.json(
      { error: "Failed to connect repository" },
      { status: 500 }
    );
  }
}
