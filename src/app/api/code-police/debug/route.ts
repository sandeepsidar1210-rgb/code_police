import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * ============================================================================
 * CODE POLICE - DEBUG ENDPOINT
 * ============================================================================
 * GET /api/code-police/debug
 * 
 * Diagnoses issues with the Code Police setup:
 * - Firebase connection
 * - GitHub OAuth token availability
 * - Project configuration
 * - Webhook configuration
 */

export async function GET(request: NextRequest) {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    checks: {},
    errors: [],
    warnings: [],
  };

  try {
    // 1. Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({
        error: 'Unauthorized',
        debug: { ...debug, authenticated: false },
      }, { status: 401 });
    }
    (debug.checks as Record<string, unknown>).authenticated = true;
    debug.userId = userId;

    // 2. Check Firebase Admin
    const adminDb = getAdminDb();
    if (!adminDb) {
      (debug.errors as string[]).push('Firebase Admin not initialized');
      (debug.checks as Record<string, unknown>).firebase = false;
    } else {
      (debug.checks as Record<string, unknown>).firebase = true;
      
      // Test Firebase connection
      try {
        const testDoc = await adminDb.collection('_health').doc('ping').get();
        (debug.checks as Record<string, unknown>).firebaseConnection = true;
      } catch (fbError) {
        (debug.checks as Record<string, unknown>).firebaseConnection = false;
        (debug.warnings as string[]).push('Firebase connection test failed (may be expected)');
      }
    }

    // 3. Check GitHub OAuth token from Clerk
    let githubToken: string | null = null;
    try {
      const clerk = await clerkClient();
      const tokens = await clerk.users.getUserOauthAccessToken(userId, "oauth_github");
      if (tokens.data && tokens.data.length > 0) {
        githubToken = tokens.data[0].token;
        (debug.checks as Record<string, unknown>).githubOAuth = true;
        (debug.checks as Record<string, unknown>).githubTokenLength = githubToken?.length || 0;
      } else {
        (debug.checks as Record<string, unknown>).githubOAuth = false;
        (debug.errors as string[]).push('No GitHub OAuth token found - user needs to connect GitHub');
      }
    } catch (oauthError) {
      (debug.checks as Record<string, unknown>).githubOAuth = false;
      (debug.errors as string[]).push(`GitHub OAuth error: ${oauthError instanceof Error ? oauthError.message : 'Unknown'}`);
    }

    // 4. Check user's projects
    if (adminDb) {
      try {
        const projectsSnapshot = await adminDb
          .collection('projects')
          .where('userId', '==', userId)
          .get();

        const projects = projectsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            githubFullName: data.githubFullName,
            githubRepoId: data.githubRepoId,
            githubRepoIdType: typeof data.githubRepoId,
            webhookId: data.webhookId,
            webhookUrl: data.webhookUrl,
            webhookSecret: data.webhookSecret ? '***configured***' : 'NOT SET',
            status: data.status || 'unknown',
            isActive: data.isActive,
          };
        });

        (debug.checks as Record<string, unknown>).projectCount = projects.length;
        debug.projects = projects;

        // Check each project's webhook configuration
        for (const project of projects) {
          const issues: string[] = [];
          
          if (!project.webhookId) {
            issues.push('webhookId missing - webhook may not be created on GitHub');
          }
          if (!project.webhookUrl) {
            issues.push('webhookUrl missing');
          } else if (project.webhookUrl.includes('localhost')) {
            issues.push('webhookUrl points to localhost - won\'t work in production!');
          }
          if (project.webhookSecret === 'NOT SET') {
            issues.push('webhookSecret missing - signature verification will fail');
          }

          if (issues.length > 0) {
            (debug.warnings as string[]).push(`Project ${project.name}: ${issues.join(', ')}`);
          }
        }
      } catch (projectError) {
        (debug.errors as string[]).push(`Error fetching projects: ${projectError instanceof Error ? projectError.message : 'Unknown'}`);
      }

      // 5. Check recent analysis runs
      try {
        const runsSnapshot = await adminDb
          .collection('analysis_runs')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();

        const runs = runsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            projectId: data.projectId,
            status: data.status,
            triggerType: data.triggerType,
            issueCounts: data.issueCounts,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          };
        });

        (debug.checks as Record<string, unknown>).recentRunCount = runs.length;
        debug.recentRuns = runs;
      } catch (runError) {
        (debug.warnings as string[]).push(`Error fetching runs: ${runError instanceof Error ? runError.message : 'Unknown'}`);
      }
    }

    // 6. Check environment variables
    const envChecks = {
      NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_APP_URL_VALUE: process.env.NEXT_PUBLIC_APP_URL?.replace(/https?:\/\//, '***://'),
      CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    };

    (debug.checks as Record<string, unknown>).environmentVariables = envChecks;

    // Generate overall status
    const hasErrors = (debug.errors as string[]).length > 0;
    const hasWarnings = (debug.warnings as string[]).length > 0;

    debug.status = hasErrors ? 'ERROR' : hasWarnings ? 'WARNING' : 'OK';
    debug.summary = hasErrors 
      ? 'There are critical issues that need to be fixed' 
      : hasWarnings 
        ? 'Some non-critical issues found' 
        : 'All checks passed!';

    return NextResponse.json(debug);

  } catch (error) {
    return NextResponse.json({
      error: 'Debug check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug,
    }, { status: 500 });
  }
}
