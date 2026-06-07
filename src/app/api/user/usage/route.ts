import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRemainingUsage, setUserProStatus, FREE_TIER_LIMITS } from "@/lib/usage";

/**
 * GET /api/user/usage
 * Get current user's usage stats and limits
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const usageData = await getRemainingUsage(userId);

        return NextResponse.json({
            isPro: usageData.isPro,
            usage: usageData.usage,
            limits: usageData.limits,
            remaining: usageData.remaining,
        });
    } catch (error) {
        console.error("[Usage API] Error:", error);
        return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
    }
}

/**
 * POST /api/user/usage
 * Upgrade to pro plan (placeholder for payment integration)
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { action } = body;

        if (action === "upgrade") {
            // In production, this would verify payment first
            await setUserProStatus(userId, true);

            const usageData = await getRemainingUsage(userId);
            return NextResponse.json({
                success: true,
                message: "Upgraded to Pro plan",
                isPro: usageData.isPro,
            });
        }

        if (action === "downgrade") {
            await setUserProStatus(userId, false);

            const usageData = await getRemainingUsage(userId);
            return NextResponse.json({
                success: true,
                message: "Downgraded to Free plan",
                isPro: usageData.isPro,
            });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[Usage API] Error:", error);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
