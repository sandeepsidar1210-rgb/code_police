/**
 * ============================================================================
 * CLERK USER UTILITIES
 * ============================================================================
 * Utilities for fetching user information from Clerk.
 */

import { clerkClient } from "@clerk/nextjs/server";

export interface UserEmailInfo {
    email: string | null;
    source: "google" | "github" | "email" | "unknown";
    needsEmailPrompt: boolean;
}

/**
 * Get user's email from Clerk based on their auth provider.
 * - Google: Email is always available via primaryEmailAddress
 * - GitHub: Email may not be available (GitHub allows private emails)
 * - Email signup: Email is always available
 */
export async function getUserEmail(userId: string): Promise<UserEmailInfo> {
    const clerk = await clerkClient();

    try {
        const user = await clerk.users.getUser(userId);

        // Determine auth source
        let source: "google" | "github" | "email" | "unknown" = "unknown";

        // Check external accounts to determine provider
        if (user.externalAccounts && user.externalAccounts.length > 0) {
            const primaryAccount = user.externalAccounts[0];
            if (primaryAccount.provider === "oauth_google" || primaryAccount.verification?.strategy === "oauth_google") {
                source = "google";
            } else if (primaryAccount.provider === "oauth_github" || primaryAccount.verification?.strategy === "oauth_github") {
                source = "github";
            }
        } else if (user.primaryEmailAddress) {
            // User signed up with email
            source = "email";
        }

        // Get primary email
        const email = user.primaryEmailAddress?.emailAddress ||
            user.emailAddresses?.[0]?.emailAddress ||
            null;

        // GitHub users might have private emails - check if we have one
        const needsEmailPrompt = source === "github" && !email;

        return {
            email,
            source,
            needsEmailPrompt,
        };
    } catch (error) {
        console.error("[ClerkUtils] Error fetching user:", error);
        return {
            email: null,
            source: "unknown",
            needsEmailPrompt: true,
        };
    }
}

/**
 * Store user email in Firestore for caching and offline access
 * Also initializes usage tracking fields for SaaS limits
 */
export async function syncUserEmailToFirestore(
    userId: string,
    email: string,
    db: import("firebase-admin/firestore").Firestore
): Promise<void> {
    try {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // New user - create with full usage data
            await userRef.set({
                email,
                emailUpdatedAt: new Date(),
                plan: "free",
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
            });
        } else {
            // Existing user - just update email
            await userRef.update({
                email,
                emailUpdatedAt: new Date(),
            });
        }
    } catch (error) {
        console.error("[ClerkUtils] Error syncing email to Firestore:", error);
    }
}
