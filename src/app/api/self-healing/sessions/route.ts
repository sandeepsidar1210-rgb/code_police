import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * ============================================================================
 * SELF-HEALING - SESSIONS LIST ENDPOINT
 * ============================================================================
 * GET /api/self-healing/sessions
 *
 * Returns all healing sessions for the authenticated user.
 */
export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const db = getAdminDb();
        if (!db) {
            // Firestore not configured — return empty sessions instead of 503
            return NextResponse.json({ sessions: [] });
        }

        const snapshot = await db
            .collection("healing-sessions")
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        const sessions = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startedAt: data.startedAt?.toDate?.() || data.startedAt,
                completedAt: data.completedAt?.toDate?.() || data.completedAt,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            };
        });

        return NextResponse.json({ sessions });
    } catch (error) {
        console.error("[Self-Healing] Sessions list error:", error);
        return NextResponse.json(
            { error: "Failed to fetch sessions" },
            { status: 500 }
        );
    }
}
