import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { deleteWebhook } from "@/lib/agents/code-police/github";
import type { ProjectStatus } from "@/types";

/**
 * ============================================================================
 * PROJECT SETTINGS API - [id] route
 * ============================================================================
 * GET /api/code-police/projects/[id] - Get single project
 * PATCH /api/code-police/projects/[id] - Update project settings
 * DELETE /api/code-police/projects/[id] - Delete project and remove webhook
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.error('[API] Firebase Admin not initialized. Check environment variables:', {
        hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      });
      return NextResponse.json({
        error: "Database not configured. Please check server logs for Firebase Admin initialization errors."
      }, { status: 503 });
    }

    const projectDoc = await adminDb.collection("projects").doc(id).get();

    if (!projectDoc.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = { id: projectDoc.id, ...projectDoc.data() } as { id: string; userId?: string;[key: string]: unknown };

    // Verify ownership
    if (project.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, customRules, ownerEmail, notificationPrefs, autoFixEnabled } = body;

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch existing project
    const projectDoc = await adminDb.collection("projects").doc(id).get();

    if (!projectDoc.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const existingProject = projectDoc.data();

    // Verify ownership
    if (existingProject?.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Validate and set status
    if (status !== undefined) {
      const validStatuses: ProjectStatus[] = ['active', 'paused', 'stopped'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updateData.status = status;

      // If status is changing to 'stopped', also set isActive to false for backwards compat
      if (status === 'stopped') {
        updateData.isActive = false;
      } else if (status === 'active') {
        updateData.isActive = true;
      }
    }

    // Set custom rules
    if (customRules !== undefined) {
      if (!Array.isArray(customRules)) {
        return NextResponse.json({ error: "customRules must be an array" }, { status: 400 });
      }
      updateData.customRules = customRules.filter((r: unknown) => typeof r === 'string' && r.trim());
    }

    // Set owner email
    if (ownerEmail !== undefined) {
      updateData.ownerEmail = ownerEmail;
    }

    // Set notification preferences
    if (notificationPrefs !== undefined) {
      updateData.notificationPrefs = {
        ...existingProject?.notificationPrefs,
        ...notificationPrefs,
      };
    }

    // Set auto-fix enabled
    if (autoFixEnabled !== undefined) {
      updateData.autoFixEnabled = Boolean(autoFixEnabled);
    }

    await adminDb.collection("projects").doc(id).update(updateData);

    // Fetch updated project
    const updatedDoc = await adminDb.collection("projects").doc(id).get();
    const updatedProject = { id: updatedDoc.id, ...updatedDoc.data() };

    return NextResponse.json({
      success: true,
      project: updatedProject,
      message: `Project updated successfully`,
    });
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch existing project
    const projectDoc = await adminDb.collection("projects").doc(id).get();

    if (!projectDoc.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = projectDoc.data();

    // Verify ownership
    if (project?.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Try to delete webhook from GitHub
    if (project?.webhookId && project?.githubOwner && project?.githubRepoName) {
      try {
        // Get user's GitHub token
        const userDoc = await adminDb.collection("users").doc(userId).get();
        const githubToken = userDoc.data()?.githubAccessToken;

        if (githubToken) {
          await deleteWebhook(
            githubToken,
            project.githubOwner,
            project.githubRepoName,
            project.webhookId
          );
          console.log(`[Project Delete] Webhook ${project.webhookId} deleted from GitHub`);
        }
      } catch (webhookError) {
        // Log but don't fail the delete operation
        console.warn("Failed to delete webhook from GitHub:", webhookError);
      }
    }

    // Delete project document
    await adminDb.collection("projects").doc(id).delete();

    // Optionally delete related analysis runs
    const runsSnapshot = await adminDb
      .collection("analysis_runs")
      .where("projectId", "==", id)
      .get();

    const batch = adminDb.batch();
    runsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
