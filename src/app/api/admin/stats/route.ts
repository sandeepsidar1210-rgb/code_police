import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/admin/stats
 * Fetch aggregated admin statistics
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check admin access
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const userEmail = user.emailAddresses[0]?.emailAddress;

        if (!isAdminEmail(userEmail)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        // Get counts
        const [usersSnapshot, projectsSnapshot, analysisSnapshot, pitchDecksSnapshot, equitySnapshot] = await Promise.all([
            adminDb.collection("users").count().get(),
            adminDb.collection("projects").count().get(),
            adminDb.collection("analysis_runs").count().get(),
            adminDb.collection("pitch-decks").count().get(),
            adminDb.collection("equity_projects").count().get(),
        ]);

        // Get recent activity counts (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [recentAnalysisSnapshot, recentDecksSnapshot] = await Promise.all([
            adminDb.collection("analysis_runs").where("createdAt", ">=", sevenDaysAgo).count().get(),
            adminDb.collection("pitch-decks").where("createdAt", ">=", sevenDaysAgo).count().get(),
        ]);

        // Get token usage (if tracked)
        let totalTokens = 0;
        try {
            const tokenSnapshot = await adminDb.collection("token_usage").get();
            tokenSnapshot.forEach((doc) => {
                totalTokens += doc.data().tokensUsed || 0;
            });
        } catch {
            // Token tracking might not be set up yet
        }

        return NextResponse.json({
            stats: {
                totalUsers: usersSnapshot.data().count,
                totalProjects: projectsSnapshot.data().count,
                totalAnalyses: analysisSnapshot.data().count,
                totalPitchDecks: pitchDecksSnapshot.data().count,
                totalEquityProjects: equitySnapshot.data().count,
                recentAnalyses: recentAnalysisSnapshot.data().count,
                recentPitchDecks: recentDecksSnapshot.data().count,
                totalTokensUsed: totalTokens,
            },
        });
    } catch (error) {
        console.error("[Admin Stats] Error:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
