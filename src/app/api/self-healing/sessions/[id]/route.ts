import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * ============================================================================
 * SELF-HEALING - SESSION DETAIL ENDPOINT
 * ============================================================================
 * GET /api/self-healing/sessions/[id]
 *
 * Returns detailed info for a specific healing session including
 * bugs, attempts, and score.
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

        const session = {
            id: doc.id,
            ...data,
            startedAt: data?.startedAt?.toDate?.() || data?.startedAt,
            completedAt: data?.completedAt?.toDate?.() || data?.completedAt,
            createdAt: data?.createdAt?.toDate?.() || data?.createdAt,
            updatedAt: data?.updatedAt?.toDate?.() || data?.updatedAt,
        };

        return NextResponse.json({ session });
    } catch (error) {
        console.error("[Self-Healing] Session detail error:", error);
        return NextResponse.json(
            { error: "Failed to fetch session" },
            { status: 500 }
        );
    }
}
