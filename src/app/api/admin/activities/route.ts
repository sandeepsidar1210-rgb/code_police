import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/admin/activities
 * Fetch system-wide activity log
 */
export async function GET(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "50");
        const type = searchParams.get("type"); // analysis, pitch-deck, equity

        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        const activities: Array<{
            id: string;
            type: string;
            title: string;
            description: string;
            userId: string;
            timestamp: string | null;
        }> = [];

        // Fetch analysis runs
        if (!type || type === "analysis") {
            const analysisSnapshot = await adminDb
                .collection("analysis_runs")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            analysisSnapshot.forEach((doc) => {
                const data = doc.data();
                const totalIssues = Object.values(data.issueCounts || {}).reduce((a: number, b) => a + (b as number), 0);
                activities.push({
                    id: doc.id,
                    type: "code-review",
                    title: `Code analysis: ${data.commitSha?.slice(0, 7) || "unknown"}`,
                    description: `Found ${totalIssues} issues on ${data.branch || "main"} branch`,
                    userId: data.userId,
                    timestamp: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        // Fetch pitch deck creations
        if (!type || type === "pitch-deck") {
            const decksSnapshot = await adminDb
                .collection("pitch-decks")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            decksSnapshot.forEach((doc) => {
                const data = doc.data();
                activities.push({
                    id: doc.id,
                    type: "pitch-deck",
                    title: `Pitch deck: ${data.projectName || "Untitled"}`,
                    description: `${data.slides?.length || 0} slides, status: ${data.status || "draft"}`,
                    userId: data.userId,
                    timestamp: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        // Fetch equity transactions
        if (!type || type === "equity") {
            const equitySnapshot = await adminDb
                .collection("equity_transactions")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            equitySnapshot.forEach((doc) => {
                const data = doc.data();
                activities.push({
                    id: doc.id,
                    type: "equity",
                    title: `Equity ${data.type || "transaction"}`,
                    description: `${data.amount || 0} tokens`,
                    userId: data.fromUserId || data.userId,
                    timestamp: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        // Fetch notifications
        if (!type) {
            const notificationsSnapshot = await adminDb
                .collection("notifications")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            notificationsSnapshot.forEach((doc) => {
                const data = doc.data();
                activities.push({
                    id: doc.id,
                    type: data.type || "notification",
                    title: data.title || "Notification",
                    description: data.message || "",
                    userId: data.userId,
                    timestamp: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        // Sort all activities by timestamp
        activities.sort((a, b) => {
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({
            activities: activities.slice(0, limit),
            total: activities.length,
        });
    } catch (error) {
        console.error("[Admin Activities] Error:", error);
        return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
    }
}
