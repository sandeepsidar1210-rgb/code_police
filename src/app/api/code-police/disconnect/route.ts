import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * ============================================================================
 * DISCONNECT REPOSITORY API
 * ============================================================================
 * Removes a repository from Code Police tracking:
 * 1. Deletes the webhook from GitHub
 * 2. Deletes the project document from Firestore
 * 3. Optionally deletes all associated analysis runs
 */

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId, deleteAnalysisRuns = false } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    // Fetch the project to verify ownership and get webhook info
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();

    if (!projectDoc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const projectData = projectDoc.data();

    // Verify ownership
    if (projectData?.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - project does not belong to this user' },
        { status: 403 }
      );
    }

    console.log('[Disconnect] Starting disconnect for project:', projectId);

    // Step 1: Delete webhook from GitHub (if exists)
    let webhookDeleted = false;
    // Check both webhookId and githubWebhookId for backwards compatibility
    const webhookId = projectData?.webhookId || projectData?.githubWebhookId;
    if (webhookId && projectData?.githubFullName) {
      try {
        const [owner, repo] = projectData.githubFullName.split('/');
        
        // Get GitHub access token from Clerk
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
          const accessToken = tokens[0]?.token;

          if (accessToken) {
            // Delete webhook using GitHub API
            const deleteWebhookResponse = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `token ${accessToken}`,
                  Accept: 'application/vnd.github.v3+json',
                },
              }
            );

            if (deleteWebhookResponse.ok || deleteWebhookResponse.status === 404) {
              webhookDeleted = true;
              console.log('[Disconnect] Webhook deleted from GitHub');
            } else {
              console.warn('[Disconnect] Failed to delete webhook:', deleteWebhookResponse.status);
            }
          }
        }
      } catch (webhookError) {
        console.error('[Disconnect] Error deleting webhook:', webhookError);
        // Continue anyway - we'll delete the project even if webhook deletion fails
      }
    }

    // Step 2: Delete analysis runs if requested
    let runsDeleted = 0;
    if (deleteAnalysisRuns) {
      try {
        const runsSnapshot = await adminDb
          .collection('analysis_runs')
          .where('projectId', '==', projectId)
          .get();

        const deleteBatch = adminDb.batch();
        runsSnapshot.docs.forEach((doc) => {
          deleteBatch.delete(doc.ref);
        });

        await deleteBatch.commit();
        runsDeleted = runsSnapshot.size;
        console.log(`[Disconnect] Deleted ${runsDeleted} analysis runs`);
      } catch (runsError) {
        console.error('[Disconnect] Error deleting analysis runs:', runsError);
        // Continue anyway
      }
    }

    // Step 3: Delete the project document
    await adminDb.collection('projects').doc(projectId).delete();
    console.log('[Disconnect] Project document deleted');

    return NextResponse.json({
      success: true,
      message: 'Repository disconnected successfully',
      details: {
        projectId,
        webhookDeleted,
        runsDeleted,
      },
    });

  } catch (error) {
    console.error('[Disconnect] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to disconnect repository',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
