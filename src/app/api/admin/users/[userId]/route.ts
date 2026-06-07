import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/admin";
import { setUserProStatus } from "@/lib/usage";

/**
 * PATCH /api/admin/users/[userId]
 * Toggle user's pro status (admin only)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId: adminId } = await auth();
        if (!adminId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if current user is admin
        const adminUser = await currentUser();
        const adminEmail = adminUser?.primaryEmailAddress?.emailAddress || "";

        if (!isAdminEmail(adminEmail)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const resolvedParams = await params;
        const targetUserId = resolvedParams.userId;

        if (!targetUserId) {
            return NextResponse.json({ error: "User ID required" }, { status: 400 });
        }

        const body = await request.json();
        const { isPro } = body;

        if (typeof isPro !== "boolean") {
            return NextResponse.json({ error: "isPro must be a boolean" }, { status: 400 });
        }

        const adminDb = getAdminDb();
        if (!adminDb) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        // Check if user exists
        const userRef = adminDb.collection("users").doc(targetUserId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Update user's pro status
        await setUserProStatus(targetUserId, isPro);

        console.log(`[Admin] User ${targetUserId} pro status set to: ${isPro} by admin ${adminEmail}`);

        return NextResponse.json({
            success: true,
            userId: targetUserId,
            isPro,
            message: isPro ? "User upgraded to Pro" : "User downgraded to Free",
        });
    } catch (error) {
        console.error("[Admin Users] Error:", error);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}
