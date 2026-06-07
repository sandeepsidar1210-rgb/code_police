import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { runHealingLoop } from "@/lib/agents/self-healing/orchestrator";
import { parseGitHubUrl, getHealingBranchName } from "@/lib/agents/self-healing/repo-manager";
import { v4 as uuidv4 } from "uuid";

/**
 * ============================================================================
 * SELF-HEALING - START ENDPOINT (AUTONOMOUS / FORK-BASED)
 * ============================================================================
 * POST /api/self-healing/start
 *
 * Accepts a GitHub URL, creates a healing session, and kicks off
 * the healing loop in the background.
 *
 * No GitHub auth required from the user — uses GITHUB_BOT_TOKEN from .env
 * to fork the repo, push fixes, and create cross-fork PRs.
 *
 * The user just enters a URL. That's it.
 */
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { repoUrl, teamName, leaderName, targetBranch, customRules } = body;

        if (!repoUrl) {
            return NextResponse.json(
                { error: "Missing required field: repoUrl" },
                { status: 400 }
            );
        }

        if (!teamName || !leaderName) {
            return NextResponse.json(
                { error: "Missing required fields: teamName and leaderName" },
                { status: 400 }
            );
        }

        // Validate GitHub URL
        let repoOwner: string;
        let repoName: string;
        try {
            const parsed = parseGitHubUrl(repoUrl);
            repoOwner = parsed.owner;
            repoName = parsed.repo;
        } catch {
            return NextResponse.json(
                { error: "Invalid GitHub URL. Expected format: https://github.com/owner/repo" },
                { status: 400 }
            );
        }

        // Verify GITHUB_BOT_TOKEN exists
        if (!process.env.GITHUB_BOT_TOKEN) {
            return NextResponse.json(
                { error: "Server configuration error: GITHUB_BOT_TOKEN is not set." },
                { status: 500 }
            );
        }

        // Create session
        const sessionId = uuidv4();
        const branchName = getHealingBranchName(teamName, leaderName);
        const now = new Date();

        const resolvedBranch = (typeof targetBranch === "string" && targetBranch.trim()) ? targetBranch.trim() : "main";
        const resolvedRules = (typeof customRules === "string" && customRules.trim()) ? customRules.trim() : undefined;

        const sessionData = {
            id: sessionId,
            userId,
            repoUrl,
            repoOwner,
            repoName,
            branchName,
            targetBranch: resolvedBranch,
            ...(resolvedRules ? { customRules: resolvedRules } : {}),
            teamName,
            leaderName,
            status: "queued" as const,
            currentAttempt: 0,
            maxAttempts: 5,
            bugs: [],
            attempts: [],
            score: null,
            startedAt: now,
            createdAt: now,
            updatedAt: now,
        };

        // Store in Firestore
        const db = getAdminDb();
        if (db) {
            await db.collection("healing-sessions").doc(sessionId).set(sessionData);
        }

        // Start the healing loop in the background (non-blocking)
        runHealingLoop({
            sessionId,
            repoUrl,
            userId,
            teamName,
            leaderName,
            targetBranch: resolvedBranch,
            customRules: resolvedRules,
        }).catch((error) => {
            console.error("[Self-Healing] Background loop error:", error);
        });

        return NextResponse.json({
            success: true,
            sessionId,
            branchName,
            message: `Self-healing started for ${repoOwner}/${repoName}`,
        });
    } catch (error) {
        console.error("[Self-Healing] Start error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: "Failed to start self-healing", details: errorMessage },
            { status: 500 }
        );
    }
}
