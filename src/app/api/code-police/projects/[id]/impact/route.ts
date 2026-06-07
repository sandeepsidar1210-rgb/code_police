import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getGithubToken } from "@/lib/utils/github-token";
import { analyzePrImpact } from "@/lib/agents/code-police/pr-impact";

/**
 * ============================================================================
 * ON-DEMAND PR IMPACT API
 * ============================================================================
 * POST /api/code-police/projects/[id]/impact
 * Body: { prNumber: number }
 *
 * Lets a maintainer run the dependency-graph blast-radius + merge-conflict
 * pre-check for any open PR on demand, without waiting for a webhook.
 */

const GITHUB_API_BASE = "https://api.github.com";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { prNumber } = await request.json();
    if (!prNumber || typeof prNumber !== "number") {
      return NextResponse.json({ error: "prNumber is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const projectDoc = await adminDb.collection("projects").doc(id).get();
    if (!projectDoc.exists) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const project = projectDoc.data()!;
    if (project.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const owner = project.githubOwner as string;
    const repo = project.githubRepoName as string;
    if (!owner || !repo) {
      return NextResponse.json({ error: "Project is not linked to a GitHub repo" }, { status: 400 });
    }

    const token = await getGithubToken(userId, adminDb);
    if (!token) {
      return NextResponse.json({ error: "No GitHub token. Please reconnect GitHub." }, { status: 400 });
    }

    // Load PR metadata (branches + changed files).
    const prRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (!prRes.ok) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }
    const pr = await prRes.json();

    const filesRes = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
    );
    const prFiles = filesRes.ok ? await filesRes.json() : [];
    const changedFiles = (prFiles as Array<{ filename: string; status: string }>)
      .filter((f) => f.status !== "removed")
      .map((f) => f.filename);

    const result = await analyzePrImpact({
      githubToken: token,
      owner,
      repo,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      prNumber,
      changedFiles,
      includeConflicts: true,
    });

    return NextResponse.json({
      success: true,
      impact: result.impact,
      conflicts: result.conflicts,
      comment: result.comment,
    });
  } catch (error) {
    console.error("Error computing PR impact:", error);
    return NextResponse.json({ error: "Failed to compute impact" }, { status: 500 });
  }
}
