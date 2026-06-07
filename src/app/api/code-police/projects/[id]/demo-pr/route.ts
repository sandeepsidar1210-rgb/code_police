import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const projectId = resolvedParams.id;

    if (!adminDb) {
      return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
    }

    const projectDoc = await adminDb.collection("projects").doc(projectId).get();
    if (!projectDoc.exists || projectDoc.data()?.userId !== userId) {
      return NextResponse.json({ error: "Project not found or unauthorized" }, { status: 404 });
    }

    // Insert a dummy PR Analysis Run with Dependency Impact and Conflicts
    const runRef = adminDb.collection("analysis_runs").doc();
    await runRef.set({
      projectId,
      commitSha: "mock" + Math.random().toString(36).substring(7),
      branch: "feature/mock-demo",
      status: "completed",
      triggerType: "pull_request",
      prNumber: Math.floor(Math.random() * 100) + 1,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      issueCounts: { critical: 0, high: 1, medium: 2, low: 0, info: 0 },
      summary: "Simulated PR webhook for demonstrating Open Source Maintainer features.",
      impact: {
        riskScore: 65,
        riskLevel: "high",
        changedFiles: ["src/core/auth.ts", "package.json"],
        affectedFiles: [
          { path: "src/api/login.ts", depth: 1 },
          { path: "src/api/signup.ts", depth: 1 },
          { path: "src/components/Header.tsx", depth: 2 },
          { path: "src/app/layout.tsx", depth: 3 }
        ],
        directDependents: ["src/api/login.ts", "src/api/signup.ts"],
        edges: [
          { from: "src/api/login.ts", to: "src/core/auth.ts" },
          { from: "src/api/signup.ts", to: "src/core/auth.ts" },
          { from: "src/components/Header.tsx", to: "src/api/login.ts" },
          { from: "src/app/layout.tsx", to: "src/components/Header.tsx" }
        ],
        mergeable: false,
        conflictRisk: "high",
        likelyConflicts: ["package.json"]
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Demo PR creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
