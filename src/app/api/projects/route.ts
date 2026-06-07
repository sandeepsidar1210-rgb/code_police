import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { createWebhook, deleteWebhook } from "@/lib/agents/code-police/github";
import crypto from "crypto";

/**
 * ============================================================================
 * PROJECTS API
 * ============================================================================
 * Unified projects management for Code Police agent.
 */

interface ProjectInput {
  name: string;
  githubRepoId?: number;
  githubOwner?: string;
  githubRepoName?: string;
  githubFullName?: string;
  defaultBranch?: string;
  language?: string;
}

/**
 * GET /api/projects - List user's projects
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("id");
    const limit = parseInt(searchParams.get("limit") || "50");

    if (projectId) {
      // Get single project
      const doc = await adminDb.collection("projects").doc(projectId).get();

      if (!doc.exists) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const data = doc.data();
      if (data?.userId !== userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      return NextResponse.json({ project: { id: doc.id, ...data } });
    }

    // Get all projects for user
    const snapshot = await adminDb
      .collection("projects")
      .where("userId", "==", userId)
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    const projects = snapshot.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Fetch projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects - Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as ProjectInput;
    const {
      name,
      githubRepoId,
      githubOwner,
      githubRepoName,
      githubFullName,
      defaultBranch = "main",
      language,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Get user's GitHub token for webhook setup
    const userDoc = await adminDb.collection("users").doc(userId).get();
    const userData = userDoc.data();
    const githubToken = userData?.githubAccessToken;

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString("hex");
    let webhookId: number | undefined;

    // Create GitHub webhook if we have repo info and token
    if (githubOwner && githubRepoName && githubToken) {
      try {
        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`;
        const result = await createWebhook(
          githubToken,
          githubOwner,
          githubRepoName,
          webhookUrl,
          webhookSecret
        );
        webhookId = result.id;
      } catch (error) {
        console.error("Failed to create webhook:", error);
        // Continue without webhook
      }
    }

    const now = new Date();
    const projectData = {
      userId,
      name,
      githubRepoId,
      githubOwner,
      githubRepoName,
      githubFullName,
      defaultBranch,
      language,
      webhookId,
      webhookSecret,
      isActive: true,
      rulesProfile: {
        strictness: "moderate",
        categories: {
          security: true,
          performance: true,
          readability: true,
          bugs: true,
          tests: true,
          style: false,
        },
        ignorePatterns: ["node_modules/**", "*.min.js", "dist/**"],
        severityThreshold: "low",
      },
      notificationPrefs: {
        emailOnPush: true,
        emailOnPR: true,
        minSeverity: "medium",
        additionalEmails: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection("projects").add(projectData);

    return NextResponse.json({
      success: true,
      project: { id: docRef.id, ...projectData },
    });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects - Update a project
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, ...updates } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const docRef = adminDb.collection("projects").doc(projectId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (doc.data()?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only allow specific fields to be updated
    const allowedFields = [
      "name",
      "isActive",
      "rulesProfile",
      "notificationPrefs",
    ];
    const safeUpdates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    for (const field of allowedFields) {
      if (field in updates) {
        safeUpdates[field] = updates[field];
      }
    }

    await docRef.update(safeUpdates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects - Delete a project
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("id");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const docRef = adminDb.collection("projects").doc(projectId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projectData = doc.data();
    if (projectData?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete GitHub webhook if exists
    if (projectData?.webhookId && projectData?.githubOwner && projectData?.githubRepoName) {
      const userDoc = await adminDb.collection("users").doc(userId).get();
      const githubToken = userDoc.data()?.githubAccessToken;

      if (githubToken) {
        try {
          await deleteWebhook(
            githubToken,
            projectData.githubOwner,
            projectData.githubRepoName,
            projectData.webhookId
          );
        } catch (error) {
          console.error("Failed to delete webhook:", error);
        }
      }
    }

    // Delete the project
    await docRef.delete();

    // Also delete related analysis runs (optional - could keep for history)
    const runsSnapshot = await adminDb
      .collection("analysis_runs")
      .where("projectId", "==", projectId)
      .get();

    const batch = adminDb.batch();
    for (const runDoc of runsSnapshot.docs) {
      batch.delete(runDoc.ref);
    }
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
