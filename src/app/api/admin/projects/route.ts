import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/admin/projects
 * Fetch all projects across all users
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
        const type = searchParams.get("type"); // code-police, pitch-deck, equity
        const limit = parseInt(searchParams.get("limit") || "50");

        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        const projects: Array<{
            id: string;
            name: string;
            type: string;
            userId: string;
            userEmail?: string;
            status?: string;
            createdAt: string | null;
        }> = [];

        // Fetch based on type filter
        if (!type || type === "code-police") {
            const codePoliceSnapshot = await adminDb
                .collection("projects")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            codePoliceSnapshot.forEach((doc) => {
                const data = doc.data();
                projects.push({
                    id: doc.id,
                    name: data.name || data.githubFullName || "Untitled",
                    type: "code-police",
                    userId: data.userId,
                    status: data.status,
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        if (!type || type === "pitch-deck") {
            const pitchDeckSnapshot = await adminDb
                .collection("pitch-decks")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            pitchDeckSnapshot.forEach((doc) => {
                const data = doc.data();
                projects.push({
                    id: doc.id,
                    name: data.projectName || "Untitled Deck",
                    type: "pitch-deck",
                    userId: data.userId,
                    status: data.status,
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        if (!type || type === "equity") {
            const equitySnapshot = await adminDb
                .collection("equity_projects")
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get();

            equitySnapshot.forEach((doc) => {
                const data = doc.data();
                projects.push({
                    id: doc.id,
                    name: data.name || "Untitled Project",
                    type: "equity",
                    userId: data.userId,
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                });
            });
        }

        // Sort all by createdAt
        projects.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({
            projects: projects.slice(0, limit),
            total: projects.length,
        });
    } catch (error) {
        console.error("[Admin Projects] Error:", error);
        return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }
}
