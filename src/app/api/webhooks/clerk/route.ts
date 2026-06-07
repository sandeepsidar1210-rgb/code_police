import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { headers } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import type { UserPlan, UserSettings } from "@/types";

/**
 * ============================================================================
 * CLERK WEBHOOK HANDLER
 * ============================================================================
 * POST /api/webhooks/clerk
 * 
 * Handles user lifecycle events from Clerk.
 */

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    username?: string | null;
    external_accounts?: Array<{
      provider: string;
      username?: string;
    }>;
    primary_email_address_id?: string;
  };
}

export async function POST(request: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("Missing CLERK_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  // Get the body
  const payload = await request.json();
  const body = JSON.stringify(payload);

  // Verify the webhook
  const wh = new Webhook(WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Handle the event
  const { type, data } = event;
  console.log(`Clerk webhook: ${type}`);

  try {
    switch (type) {
      case "user.created":
        await handleUserCreated(data);
        break;
      case "user.updated":
        await handleUserUpdated(data);
        break;
      case "user.deleted":
        await handleUserDeleted(data);
        break;
      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle user.created event
 */
async function handleUserCreated(data: ClerkWebhookEvent["data"]) {
  const { id, email_addresses, first_name, last_name, image_url, external_accounts } = data;

  const primaryEmail = email_addresses?.find(
    (e) => e.id === data.primary_email_address_id
  )?.email_address || email_addresses?.[0]?.email_address;

  if (!primaryEmail) {
    console.error("User created without email:", id);
    return;
  }

  // Check for GitHub connection
  const githubAccount = external_accounts?.find(
    (a) => a.provider === "oauth_github"
  );

  const now = new Date();
  const defaultSettings: UserSettings = {
    theme: "dark",
    emailNotifications: true,
  };

  const userData = {
    clerkId: id,
    email: primaryEmail,
    name: [first_name, last_name].filter(Boolean).join(" ") || "User",
    avatarUrl: image_url || undefined,
    plan: "free" as UserPlan,
    githubConnected: !!githubAccount,
    githubUsername: githubAccount?.username,
    settings: defaultSettings,
    createdAt: now,
    updatedAt: now,
  };

  // Use clerkId as document ID for easy lookup
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("[Clerk Webhook] Database not configured");
    return;
  }
  await adminDb.collection("users").doc(id).set(userData);
  console.log(`Created user: ${id}`);
}

/**
 * Handle user.updated event
 */
async function handleUserUpdated(data: ClerkWebhookEvent["data"]) {
  const { id, email_addresses, first_name, last_name, image_url, external_accounts } = data;

  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("[Clerk Webhook] Database not configured");
    return;
  }

  const userRef = adminDb.collection("users").doc(id);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // User doesn't exist in Firestore, create them
    await handleUserCreated(data);
    return;
  }

  const primaryEmail = email_addresses?.find(
    (e) => e.id === data.primary_email_address_id
  )?.email_address || email_addresses?.[0]?.email_address;

  const githubAccount = external_accounts?.find(
    (a) => a.provider === "oauth_github"
  );

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (primaryEmail) updates.email = primaryEmail;
  if (first_name !== undefined || last_name !== undefined) {
    updates.name = [first_name, last_name].filter(Boolean).join(" ") || "User";
  }
  if (image_url !== undefined) updates.avatarUrl = image_url;

  updates.githubConnected = !!githubAccount;
  if (githubAccount?.username) {
    updates.githubUsername = githubAccount.username;
  }

  await userRef.update(updates);
  console.log(`Updated user: ${id}`);
}

/**
 * Handle user.deleted event
 * Cascade delete all user data to prevent orphaned records
 */
async function handleUserDeleted(data: ClerkWebhookEvent["data"]) {
  const { id } = data;

  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("[Clerk Webhook] Database not configured");
    return;
  }

  console.log(`[Clerk Webhook] Starting cascade delete for user: ${id}`);
  const batch = adminDb.batch();
  let deleteCount = 0;

  try {
    // 1. Delete user's pitch-decks
    const pitchDecksSnapshot = await adminDb
      .collection("pitch-decks")
      .where("userId", "==", id)
      .get();
    pitchDecksSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    console.log(`[Clerk Webhook] Queued ${pitchDecksSnapshot.size} pitch-decks for deletion`);

    // 2. Delete user's code-police projects and their analysis_runs
    const projectsSnapshot = await adminDb
      .collection("projects")
      .where("userId", "==", id)
      .get();
    for (const projectDoc of projectsSnapshot.docs) {
      // Delete associated analysis_runs
      const analysisRunsSnapshot = await adminDb
        .collection("analysis_runs")
        .where("projectId", "==", projectDoc.id)
        .get();
      analysisRunsSnapshot.docs.forEach(runDoc => {
        batch.delete(runDoc.ref);
        deleteCount++;
      });
      batch.delete(projectDoc.ref);
      deleteCount++;
    }
    console.log(`[Clerk Webhook] Queued ${projectsSnapshot.size} projects for deletion`);

    // 3. Delete user's database_connections and their conversations with messages
    const connectionsSnapshot = await adminDb
      .collection("database_connections")
      .where("userId", "==", id)
      .get();
    for (const connDoc of connectionsSnapshot.docs) {
      // Delete associated conversations and their messages
      const conversationsSnapshot = await adminDb
        .collection("db_conversations")
        .where("connectionId", "==", connDoc.id)
        .get();
      for (const convDoc of conversationsSnapshot.docs) {
        // Delete messages subcollection
        const messagesSnapshot = await convDoc.ref.collection("messages").get();
        messagesSnapshot.docs.forEach(msgDoc => {
          batch.delete(msgDoc.ref);
          deleteCount++;
        });
        batch.delete(convDoc.ref);
        deleteCount++;
      }
      batch.delete(connDoc.ref);
      deleteCount++;
    }
    console.log(`[Clerk Webhook] Queued ${connectionsSnapshot.size} database connections for deletion`);

    // 4. Delete user's equity_projects
    const equityProjectsSnapshot = await adminDb
      .collection("equity_projects")
      .where("userId", "==", id)
      .get();
    equityProjectsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    console.log(`[Clerk Webhook] Queued ${equityProjectsSnapshot.size} equity projects for deletion`);

    // 5. Delete user's equity_transactions
    const equityTransactionsSnapshot = await adminDb
      .collection("equity_transactions")
      .where("userId", "==", id)
      .get();
    equityTransactionsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    console.log(`[Clerk Webhook] Queued ${equityTransactionsSnapshot.size} equity transactions for deletion`);

    // 6. Delete user document
    batch.delete(adminDb.collection("users").doc(id));
    deleteCount++;

    // Commit all deletions
    await batch.commit();
    console.log(`[Clerk Webhook] ✓ Cascade delete completed for user ${id}: ${deleteCount} documents deleted`);
  } catch (error) {
    console.error(`[Clerk Webhook] ❌ Error during cascade delete for user ${id}:`, error);
    throw error;
  }
}
