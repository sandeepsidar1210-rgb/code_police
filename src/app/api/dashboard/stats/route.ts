import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * ============================================================================
 * DASHBOARD STATS API
 * ============================================================================
 * GET /api/dashboard/stats
 * 
 * Aggregates real-time stats from all Firebase collections for the dashboard.
 */

interface DashboardStats {
  codeReviews: {
    total: number;
    thisWeek: number;
  };
  pitchDecks: {
    total: number;
    completed: number;
  };
  equityProjects: {
    total: number;
    transfers: number;
  };
  databaseQueries: {
    connections: number;
    queries: number;
  };
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: "code-review" | "pitch-deck" | "equity" | "database";
  title: string;
  description: string;
  timestamp: string;
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    
    // Return empty stats if Firebase is not configured
    if (!adminDb) {
      return NextResponse.json({
        stats: {
          codeReviews: { total: 0, thisWeek: 0 },
          pitchDecks: { total: 0, completed: 0 },
          equityProjects: { total: 0, transfers: 0 },
          databaseQueries: { connections: 0, queries: 0 },
          recentActivity: [],
        },
      });
    }

    // Calculate week start for "this week" stats
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    // Helper to safely fetch collection with fallback
    async function safeQuery(
      collection: string,
      _orderField: string = "createdAt"
    ) {
      try {
        const snapshot = await adminDb!
          .collection(collection)
          .where("userId", "==", userId)
          .limit(100)
          .get();
        return snapshot;
      } catch (error) {
        console.warn(`Failed to query ${collection}:`, error);
        return { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[], size: 0 };
      }
    }

    // Fetch all stats in parallel with error handling
    const [
      analysisRunsSnapshot,
      pitchDecksSnapshot,
      equityProjectsSnapshot,
      dbConnectionsSnapshot,
      dbConversationsSnapshot,
    ] = await Promise.all([
      safeQuery("analysis_runs"),
      safeQuery("pitchDecks"),
      safeQuery("equity_projects"),
      safeQuery("database_connections", "lastUsedAt"),
      safeQuery("database_conversations", "updatedAt"),
    ]);

    // Process Code Reviews
    const codeReviewsThisWeek = analysisRunsSnapshot.docs.filter((doc) => {
      const createdAt = doc.data().createdAt?.toDate?.();
      return createdAt && createdAt >= weekStart;
    }).length;

    // Process Pitch Decks
    const completedDecks = pitchDecksSnapshot.docs.filter(
      (doc) => doc.data().status === "completed" || doc.data().status === "published"
    ).length;

    // Calculate total queries from conversations
    let totalQueries = 0;
    dbConversationsSnapshot.docs.forEach((doc) => {
      const messages = doc.data().messages || [];
      // Count user messages as queries
      totalQueries += messages.filter((m: { role: string }) => m.role === "user").length;
    });

    // Build recent activity from all sources
    const recentActivity: ActivityItem[] = [];

    // Add recent code reviews
    analysisRunsSnapshot.docs.slice(0, 3).forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      recentActivity.push({
        id: doc.id,
        type: "code-review",
        title: "Code review completed",
        description: `Found ${Object.values(data.issueCounts || {}).reduce((a: number, b) => a + (b as number), 0)} issues`,
        timestamp: createdAt?.toISOString() || new Date().toISOString(),
      });
    });

    // Add recent pitch decks
    pitchDecksSnapshot.docs.slice(0, 3).forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      recentActivity.push({
        id: doc.id,
        type: "pitch-deck",
        title: "Pitch deck generated",
        description: `Created deck for "${data.projectName || 'Project'}"`,
        timestamp: createdAt?.toISOString() || new Date().toISOString(),
      });
    });

    // Add recent equity projects
    equityProjectsSnapshot.docs.slice(0, 2).forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      recentActivity.push({
        id: doc.id,
        type: "equity",
        title: "Equity project created",
        description: `${data.name} (${data.symbol})`,
        timestamp: createdAt?.toISOString() || new Date().toISOString(),
      });
    });

    // Add recent database connections
    dbConnectionsSnapshot.docs.slice(0, 2).forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      recentActivity.push({
        id: doc.id,
        type: "database",
        title: "Database connected",
        description: `${data.type?.toUpperCase() || 'Database'}: ${data.name}`,
        timestamp: createdAt?.toISOString() || new Date().toISOString(),
      });
    });

    // Sort activity by timestamp (most recent first)
    recentActivity.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const stats: DashboardStats = {
      codeReviews: {
        total: analysisRunsSnapshot.size,
        thisWeek: codeReviewsThisWeek,
      },
      pitchDecks: {
        total: pitchDecksSnapshot.size,
        completed: completedDecks,
      },
      equityProjects: {
        total: equityProjectsSnapshot.size,
        transfers: 0, // TODO: Track actual transfers
      },
      databaseQueries: {
        connections: dbConnectionsSnapshot.size,
        queries: totalQueries,
      },
      recentActivity: recentActivity.slice(0, 5),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
