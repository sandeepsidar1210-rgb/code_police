import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * ============================================================================
 * SELF-HEALING - MARK SESSION AS FAILED ENDPOINT
 * ============================================================================
 * POST /api/self-healing/sessions/[id]/fail
 *
 * Marks an orphaned/stale session as failed. This is used when the server
 * was restarted and the healing loop was killed mid-process.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: "Missing session ID" },
                { status: 400 }
            );
        }

        const db = getAdminDb();
        if (!db) {
            return NextResponse.json(
                { error: "Database not configured" },
                { status: 503 }
            );
        }

        const doc = await db.collection("healing-sessions").doc(id).get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: "Session not found" },
                { status: 404 }
            );
        }

        const data = doc.data();

        // Verify ownership
        if (data?.userId !== userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 }
            );
        }

        // Only allow failing non-terminal sessions
        if (data?.status === "completed" || data?.status === "failed") {
            return NextResponse.json(
                { error: "Session already finished" },
                { status: 400 }
            );
        }

        // Mark as failed
        await db.collection("healing-sessions").doc(id).update({
            status: "failed",
            error: "Session interrupted — server was restarted while healing was in progress.",
            completedAt: new Date(),
            updatedAt: new Date(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Self-Healing] Mark failed error:", error);
        return NextResponse.json(
            { error: "Failed to update session" },
            { status: 500 }
        );
    }
}
