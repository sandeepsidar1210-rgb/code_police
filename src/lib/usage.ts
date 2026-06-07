/**
 * ============================================================================
 * USAGE TRACKING & LIMITS
 * ============================================================================
 * SaaS usage tracking for free/pro tier limits
 * Focused on Code Police features only.
 */

import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ============================================================================
// TYPES
// ============================================================================

export interface UsageStats {
    codePoliceProjects: number;
    pushAnalyses: number;
    fixWithPr: number;
}

export interface UserUsageData {
    isPro: boolean;
    usage: UsageStats;
    usageResetAt: Date;
    createdAt: Date;
}

// ============================================================================
// FREE TIER LIMITS
// ============================================================================

export const FREE_TIER_LIMITS: UsageStats = {
    codePoliceProjects: 1,
    pushAnalyses: 2,
    fixWithPr: 2,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user document reference
 */
function getUserRef(userId: string) {
    const db = getAdminDb();
    if (!db) throw new Error("Database not configured");
    return db.collection("users").doc(userId);
}

/**
 * Check if usage should be reset (monthly)
 */
function shouldResetUsage(usageResetAt: Date): boolean {
    const now = new Date();
    const resetDate = new Date(usageResetAt);

    // Reset if we're in a new month
    return (
        now.getFullYear() > resetDate.getFullYear() ||
        (now.getFullYear() === resetDate.getFullYear() && now.getMonth() > resetDate.getMonth())
    );
}

/**
 * Get start of current month
 */
function getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Initialize user with default usage data
 * Call this when a new user signs up
 */
export async function initializeUserUsage(userId: string): Promise<UserUsageData> {
    const userRef = getUserRef(userId);
    const doc = await userRef.get();

    if (doc.exists) {
        const data = doc.data()!;
        // Handle both old format (plan: string) and new format (isPro: boolean)
        const isPro = data.isPro === true || data.plan === "pro";
        return {
            isPro,
            usage: data.usage || {
                codePoliceProjects: 0,
                pushAnalyses: 0,
                fixWithPr: 0,
            },
            usageResetAt: data.usageResetAt?.toDate?.() || getMonthStart(),
            createdAt: data.createdAt?.toDate?.() || new Date(),
        };
    }

    const initialData: UserUsageData = {
        isPro: false,
        usage: {
            codePoliceProjects: 0,
            pushAnalyses: 0,
            fixWithPr: 0,
        },
        usageResetAt: getMonthStart(),
        createdAt: new Date(),
    };

    await userRef.set(initialData, { merge: true });
    return initialData;
}

/**
 * Get user's current plan and usage
 */
export async function getUserUsage(userId: string): Promise<UserUsageData> {
    const userRef = getUserRef(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
        return await initializeUserUsage(userId);
    }

    const data = doc.data()!;

    // Handle both old format (plan: string) and new format (isPro: boolean)
    const isPro = data.isPro === true || data.plan === "pro";

    // Convert timestamps to dates
    const usageData: UserUsageData = {
        isPro,
        usage: data.usage || {
            codePoliceProjects: 0,
            pushAnalyses: 0,
            fixWithPr: 0,
        },
        usageResetAt: data.usageResetAt?.toDate?.() || getMonthStart(),
        createdAt: data.createdAt?.toDate?.() || new Date(),
    };

    // Check if usage should be reset (monthly)
    if (shouldResetUsage(usageData.usageResetAt)) {
        const resetUsage: UsageStats = {
            codePoliceProjects: usageData.usage.codePoliceProjects, // Don't reset project count
            pushAnalyses: 0,
            fixWithPr: 0,
        };
        await userRef.update({
            usage: resetUsage,
            usageResetAt: Timestamp.fromDate(getMonthStart()),
        });
        usageData.usage = resetUsage;
        usageData.usageResetAt = getMonthStart();
    }

    return usageData;
}

/**
 * Check if user can perform an action based on their plan limits
 */
export async function checkLimit(
    userId: string,
    feature: keyof UsageStats
): Promise<{ allowed: boolean; current: number; limit: number; isPro: boolean }> {
    const userData = await getUserUsage(userId);

    // Pro users have no limits
    if (userData.isPro) {
        return {
            allowed: true,
            current: userData.usage[feature],
            limit: Infinity,
            isPro: true,
        };
    }

    const current = userData.usage[feature];
    const limit = FREE_TIER_LIMITS[feature];

    return {
        allowed: current < limit,
        current,
        limit,
        isPro: false,
    };
}

/**
 * Increment usage counter for a feature
 * Returns false if limit would be exceeded
 */
export async function incrementUsage(
    userId: string,
    feature: keyof UsageStats
): Promise<{ success: boolean; current: number; limit: number }> {
    const check = await checkLimit(userId, feature);

    if (!check.allowed) {
        return {
            success: false,
            current: check.current,
            limit: check.limit,
        };
    }

    const userRef = getUserRef(userId);
    await userRef.update({
        [`usage.${feature}`]: FieldValue.increment(1),
    });

    return {
        success: true,
        current: check.current + 1,
        limit: check.limit,
    };
}

/**
 * Decrement usage counter (e.g., when project is deleted)
 */
export async function decrementUsage(
    userId: string,
    feature: keyof UsageStats
): Promise<void> {
    const userRef = getUserRef(userId);
    await userRef.update({
        [`usage.${feature}`]: FieldValue.increment(-1),
    });
}

/**
 * Set user's pro status (for admin use)
 */
export async function setUserProStatus(
    userId: string,
    isPro: boolean
): Promise<void> {
    const userRef = getUserRef(userId);
    await userRef.update({
        isPro,
        // Remove old plan field if it exists
        plan: FieldValue.delete(),
    });
}

/**
 * Get remaining usage for display
 */
export async function getRemainingUsage(userId: string): Promise<{
    isPro: boolean;
    remaining: Record<keyof UsageStats, number | "unlimited">;
    usage: UsageStats;
    limits: UsageStats;
}> {
    const userData = await getUserUsage(userId);

    if (userData.isPro) {
        return {
            isPro: true,
            remaining: {
                codePoliceProjects: "unlimited",
                pushAnalyses: "unlimited",
                fixWithPr: "unlimited",
            },
            usage: userData.usage,
            limits: FREE_TIER_LIMITS, // Show limits for reference
        };
    }

    const remaining: Record<keyof UsageStats, number | "unlimited"> = {
        codePoliceProjects: Math.max(0, FREE_TIER_LIMITS.codePoliceProjects - userData.usage.codePoliceProjects),
        pushAnalyses: Math.max(0, FREE_TIER_LIMITS.pushAnalyses - userData.usage.pushAnalyses),
        fixWithPr: Math.max(0, FREE_TIER_LIMITS.fixWithPr - userData.usage.fixWithPr),
    };

    return {
        isPro: false,
        remaining,
        usage: userData.usage,
        limits: FREE_TIER_LIMITS,
    };
}
