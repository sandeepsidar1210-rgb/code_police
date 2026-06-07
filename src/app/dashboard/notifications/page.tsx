import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { NotificationsClient } from "./notifications-client";

// Force dynamic rendering
export const dynamic = "force-dynamic";

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
    metadata?: Record<string, unknown>;
}

async function getNotifications(userId: string): Promise<Notification[]> {
    const adminDb = getAdminDb();
    if (!adminDb) return [];

    try {
        const snapshot = await adminDb
            .collection("notifications")
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.type || "general",
                title: data.title || "Notification",
                message: data.message || "",
                isRead: data.isRead || false,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                metadata: data.metadata,
            };
        });
    } catch (error) {
        console.error("[Notifications] Error fetching:", error);
        return [];
    }
}

export default async function NotificationsPage() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const notifications = await getNotifications(userId);

    return <NotificationsClient initialNotifications={notifications} />;
}
