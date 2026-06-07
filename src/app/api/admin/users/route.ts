import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/admin/users
 * Fetch all users with their project counts
 */
export async function GET(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check admin access
        const client = await clerkClient();
        const currentUser = await client.users.getUser(userId);
        const userEmail = currentUser.emailAddresses[0]?.emailAddress;

        if (!isAdminEmail(userEmail)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = parseInt(searchParams.get("offset") || "0");

        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        // Get users from Clerk
        const clerkUsers = await client.users.getUserList({
            limit,
            offset,
        });

        // Get project counts from Firestore for each user
        const usersWithStats = await Promise.all(
            clerkUsers.data.map(async (user) => {
                const [projectsCount, analysesCount, decksCount, equityCount, userDoc] = await Promise.all([
                    adminDb.collection("projects").where("userId", "==", user.id).count().get(),
                    adminDb.collection("analysis_runs").where("userId", "==", user.id).count().get(),
                    adminDb.collection("pitch-decks").where("userId", "==", user.id).count().get(),
                    adminDb.collection("equity_projects").where("userId", "==", user.id).count().get(),
                    adminDb.collection("users").doc(user.id).get(),
                ]);

                // Get isPro from Firestore (handle both old plan format and new isPro format)
                const userData = userDoc.data();
                const isPro = userData?.isPro === true || userData?.plan === "pro";

                return {
                    id: user.id,
                    email: user.emailAddresses[0]?.emailAddress || "N/A",
                    fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Unknown",
                    imageUrl: user.imageUrl,
                    createdAt: user.createdAt,
                    lastSignInAt: user.lastSignInAt,
                    isPro,
                    stats: {
                        projects: projectsCount.data().count,
                        analyses: analysesCount.data().count,
                        pitchDecks: decksCount.data().count,
                        equityProjects: equityCount.data().count,
                    },
                };
            })
        );

        return NextResponse.json({
            users: usersWithStats,
            total: clerkUsers.totalCount,
            hasMore: offset + limit < clerkUsers.totalCount,
        });
    } catch (error) {
        console.error("[Admin Users] Error:", error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}
