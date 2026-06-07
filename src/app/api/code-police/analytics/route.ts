import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { computeFullAnalytics, type FullAnalytics } from '@/lib/agents/code-police/analytics';
import {
    generateAIInsights,
    createMetricsCacheKey,
    type MetricsSummary,
    type AIInsights,
} from '@/lib/agents/code-police/analytics-ai';

/**
 * ============================================================================
 * CODE POLICE - ANALYTICS API ENDPOINT
 * ============================================================================
 * GET /api/code-police/analytics?projectId=xxx
 *
 * Fetches comprehensive repository analytics with caching.
 * Most metrics are computed deterministically (no AI tokens).
 * AI is only used for executive summary and action items.
 */

interface AnalyticsResponse {
    success: boolean;
    analytics?: FullAnalytics & { aiInsights?: AIInsights };
    error?: string;
    cached?: boolean;
    aiRequested?: boolean;
}

// Cache duration: 1 hour for analytics data
const ANALYTICS_CACHE_DURATION_MS = 60 * 60 * 1000;

// Cache duration: 7 days for AI insights (extended to reduce token usage)
const AI_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest): Promise<NextResponse<AnalyticsResponse>> {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const skipCache = searchParams.get('fresh') === 'true';
        // AI insights are optional to save tokens - only generate when user requests
        const includeAI = searchParams.get('includeAI') === 'true';

        if (!projectId) {
            return NextResponse.json(
                { success: false, error: 'Missing projectId parameter' },
                { status: 400 }
            );
        }

        // Get Firestore instance
        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        // Fetch project
        const projectDoc = await adminDb.collection('projects').doc(projectId).get();
        if (!projectDoc.exists) {
            return NextResponse.json(
                { success: false, error: 'Project not found' },
                { status: 404 }
            );
        }

        const project = projectDoc.data()!;

        // Verify ownership
        if (project.userId !== userId) {
            return NextResponse.json(
                { success: false, error: 'Access denied' },
                { status: 403 }
            );
        }

        // Get owner and repo from project (with fallback for older projects)
        let owner = project.githubOwner;
        let repo = project.githubRepoName;

        // Fallback: parse from githubFullName if individual fields are missing
        if ((!owner || !repo) && project.githubFullName) {
            const parts = project.githubFullName.split('/');
            if (parts.length === 2) {
                owner = parts[0];
                repo = parts[1];
            }
        }

        if (!owner || !repo) {
            return NextResponse.json(
                { success: false, error: 'Repository information not found. Please reconnect the repository.' },
                { status: 400 }
            );
        }

        // Check cache first (unless skipCache is set)
        const cacheRef = adminDb.collection('analytics_cache').doc(projectId);

        if (!skipCache) {
            const cached = await cacheRef.get();
            if (cached.exists) {
                const cacheData = cached.data()!;
                const cacheAge = Date.now() - (cacheData.cachedAt?.toDate?.()?.getTime() || 0);

                if (cacheAge < ANALYTICS_CACHE_DURATION_MS) {
                    console.log(`[Analytics] Serving cached analytics for ${owner}/${repo}`);
                    return NextResponse.json({
                        success: true,
                        analytics: cacheData.analytics,
                        cached: true,
                    });
                }
            }
        }

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
        } catch (tokenError) {
            console.error('[Analytics] Error fetching Clerk token:', tokenError);
        }

        // Fallback to stored token
        if (!githubToken) {
            const userDoc = await adminDb.collection('users').doc(userId).get();
            const userData = userDoc.data();
            githubToken = userData?.githubAccessToken || null;
        }

        if (!githubToken) {
            return NextResponse.json(
                { success: false, error: 'GitHub token not found. Please reconnect GitHub.' },
                { status: 400 }
            );
        }

        console.log(`[Analytics] Computing analytics for ${owner}/${repo}`);

        // Compute full analytics (deterministic - no AI)
        const analytics = await computeFullAnalytics(githubToken, owner, repo);

        // Prepare metrics summary for AI
        const metricsSummary: MetricsSummary = {
            repoName: `${owner}/${repo}`,
            languages: Object.fromEntries(
                analytics.languages.slice(0, 3).map((l) => [l.name, l.percentage])
            ),
            commits90d: analytics.activity.commitsLast90Days,
            contributorCount: analytics.contributors.total,
            busFactor: analytics.contributors.busFactor,
            avgPRMergeHrs: analytics.pullRequests.avgMergeTimeHours,
            openIssues: analytics.issues.openCount,
            avgIssueCloseDays: analytics.issues.avgCloseTimeDays,
            docsScore: analytics.documentation.score,
            testCount: analytics.testing.testFileCount,
            healthScore: analytics.healthScore.total,
            healthGrade: analytics.healthScore.grade,
            trend: analytics.activity.trend,
        };

        // Check AI insights cache
        const aiCacheKey = createMetricsCacheKey(metricsSummary);
        const aiCacheRef = adminDb.collection('ai_insights_cache').doc(aiCacheKey);

        let aiInsights: AIInsights | undefined;
        let aiCached = false;

        // Only generate AI insights if explicitly requested (saves tokens)
        if (includeAI) {
            const aiCacheDoc = await aiCacheRef.get();
            if (aiCacheDoc.exists && !skipCache) {
                const aiCacheData = aiCacheDoc.data()!;
                const aiCacheAge = Date.now() - (aiCacheData.cachedAt?.toDate?.()?.getTime() || 0);

                if (aiCacheAge < AI_CACHE_DURATION_MS) {
                    console.log(`[Analytics] Using cached AI insights (7-day cache)`);
                    aiInsights = aiCacheData.insights;
                    aiCached = true;
                } else {
                    // Generate fresh AI insights
                    console.log(`[Analytics] Generating AI insights (token usage: ~400-800 tokens)`);
                    aiInsights = await generateAIInsights(metricsSummary);
                    await aiCacheRef.set({
                        insights: aiInsights,
                        cachedAt: new Date(),
                    });
                }
            } else {
                // Generate fresh AI insights
                console.log(`[Analytics] Generating AI insights (token usage: ~400-800 tokens)`);
                aiInsights = await generateAIInsights(metricsSummary);
                await aiCacheRef.set({
                    insights: aiInsights,
                    cachedAt: new Date(),
                });
            }
        } else {
            console.log(`[Analytics] Skipping AI insights (use ?includeAI=true to generate)`);
        }

        // Combine analytics with optional AI insights
        const fullAnalytics = {
            ...analytics,
            ...(aiInsights && {
                aiInsights: {
                    ...aiInsights,
                    cached: aiCached,
                },
            }),
        };

        // Cache the full analytics
        await cacheRef.set({
            analytics: fullAnalytics,
            cachedAt: new Date(),
        });

        console.log(`[Analytics] Completed analytics for ${owner}/${repo}, health: ${analytics.healthScore.total}`);

        return NextResponse.json({
            success: true,
            analytics: fullAnalytics,
            cached: false,
            aiRequested: includeAI,
        });
    } catch (error) {
        console.error('[Analytics] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}
