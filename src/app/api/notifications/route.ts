import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
} from "@/lib/notifications";

/**
 * ============================================================================
 * NOTIFICATIONS API
 * ============================================================================
 * PATCH /api/notifications - Mark notification(s) as read
 * DELETE /api/notifications - Delete a notification
 */

/**
 * PATCH - Mark notification(s) as read
 */
export async function PATCH(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { notificationId, markAll } = body;

        if (markAll) {
            // Mark all notifications as read
            const success = await markAllNotificationsAsRead(userId);
            if (!success) {
                return NextResponse.json(
                    { error: "Failed to mark all as read" },
                    { status: 500 }
                );
            }
            return NextResponse.json({ success: true, message: "All marked as read" });
        }

        if (!notificationId) {
            return NextResponse.json(
                { error: "notificationId is required" },
                { status: 400 }
            );
        }

        const success = await markNotificationAsRead(notificationId);
        if (!success) {
            return NextResponse.json(
                { error: "Failed to mark as read" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Notifications API] PATCH error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Delete a notification
 */
export async function DELETE(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const notificationId = searchParams.get("id");

        if (!notificationId) {
            return NextResponse.json(
                { error: "id parameter is required" },
                { status: 400 }
            );
        }

        const success = await deleteNotification(notificationId);
        if (!success) {
            return NextResponse.json(
                { error: "Failed to delete notification" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Notifications API] DELETE error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
