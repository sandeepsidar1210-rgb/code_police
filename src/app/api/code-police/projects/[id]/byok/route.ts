import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  makeByokConfig,
  isPlausibleGeminiKey,
} from "@/lib/agents/code-police/byok";

/**
 * ============================================================================
 * PROJECT BYOK API
 * ============================================================================
 * PUT    /api/code-police/projects/[id]/byok  - Set the project's Gemini key
 * DELETE /api/code-police/projects/[id]/byok  - Remove the project's key
 *
 * The raw key is encrypted server-side and never returned to the client. Only
 * a non-sensitive hint (e.g. "AIza…9f2c") is surfaced for display.
 */

async function loadOwnedProject(id: string, userId: string) {
  const adminDb = getAdminDb();
  if (!adminDb) return { error: NextResponse.json({ error: "Database not configured" }, { status: 503 }) };

  const doc = await adminDb.collection("projects").doc(id).get();
  if (!doc.exists) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };

  const data = doc.data();
  if (data?.userId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { adminDb, doc };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { apiKey } = await request.json();

    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }
    if (!isPlausibleGeminiKey(apiKey)) {
      return NextResponse.json({ error: "That does not look like a valid Gemini API key" }, { status: 400 });
    }

    const loaded = await loadOwnedProject(id, userId);
    if ("error" in loaded) return loaded.error;

    let byok;
    try {
      byok = makeByokConfig(apiKey.trim());
    } catch {
      return NextResponse.json(
        { error: "BYOK is not enabled on this server (missing BYOK_ENCRYPTION_KEY)" },
        { status: 503 }
      );
    }

    await loaded.adminDb.collection("projects").doc(id).update({
      byok,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, keyHint: byok.keyHint });
  } catch (error) {
    console.error("Error setting BYOK key:", error);
    return NextResponse.json({ error: "Failed to set key" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const loaded = await loadOwnedProject(id, userId);
    if ("error" in loaded) return loaded.error;

    await loaded.adminDb.collection("projects").doc(id).update({
      byok: null,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing BYOK key:", error);
    return NextResponse.json({ error: "Failed to remove key" }, { status: 500 });
  }
}
