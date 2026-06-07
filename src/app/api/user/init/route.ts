import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { initializeUserUsage } from "@/lib/usage";

/**
 * POST /api/user/init
 * Initialize user in Firestore on first login
 * Called from dashboard to ensure user document exists
 */
export async function POST() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const adminDb = getAdminDb();
        if (!adminDb) {
            // Firestore not configured — skip init gracefully
            return NextResponse.json({
                success: true,
                message: "Database not configured — skipping user init",
                isNewUser: false,
            });
        }

        // Check if user already exists
        const userRef = adminDb.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // Get email from Clerk
            const email = user.primaryEmailAddress?.emailAddress ||
                user.emailAddresses?.[0]?.emailAddress ||
                "";

            // Create new user document with usage tracking
            await userRef.set({
                email,
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                imageUrl: user.imageUrl || "",
                isPro: false,
                usage: {
                    codePoliceProjects: 0,
                    pushAnalyses: 0,
                    fixWithPr: 0,
                    pitchDecks: 0,
                    databaseConnections: 0,
                    databaseQueries: 0,
                },
                usageResetAt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                createdAt: new Date(),
                emailUpdatedAt: new Date(),
            });

            console.log(`[User Init] Created new user: ${userId}`);

            return NextResponse.json({
                success: true,
                message: "User created",
                isNewUser: true,
            });
        }

        // User exists - make sure usage fields exist (for existing users)
        const userData = userDoc.data()!;
        if (!userData.usage) {
            await userRef.update({
                plan: userData.plan || "free",
                usage: {
                    codePoliceProjects: 0,
                    pushAnalyses: 0,
                    fixWithPr: 0,
                    pitchDecks: 0,
                    databaseConnections: 0,
                    databaseQueries: 0,
                },
                usageResetAt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            });
            console.log(`[User Init] Added usage fields to existing user: ${userId}`);
        }

        return NextResponse.json({
            success: true,
            message: "User already exists",
            isNewUser: false,
        });
    } catch (error) {
        console.error("[User Init] Error:", error);
        return NextResponse.json({ error: "Failed to initialize user" }, { status: 500 });
    }
}
