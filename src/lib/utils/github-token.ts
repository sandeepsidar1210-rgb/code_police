/**
 * ============================================================================
 * GITHUB TOKEN RESOLVER
 * ============================================================================
 * Resolves a user's GitHub OAuth token. Prefers the token stored in Clerk
 * (the canonical location), falling back to a legacy token in the user's
 * Firestore document for older accounts.
 */

import type { Firestore } from "firebase-admin/firestore";

export async function getGithubToken(
  userId: string,
  adminDb: Firestore
): Promise<string | null> {
  // 1. Clerk OAuth token (canonical).
  try {
    const res = await fetch(
      `https://api.clerk.com/v1/users/${userId}/oauth_access_tokens/oauth_github`,
      { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
    );
    if (res.ok) {
      const tokens = await res.json();
      if (Array.isArray(tokens) && tokens[0]?.token) return tokens[0].token;
    }
  } catch (err) {
    console.error("[GithubToken] Clerk lookup failed:", err);
  }

  // 2. Legacy Firestore token.
  try {
    const userDoc = await adminDb.collection("users").doc(userId).get();
    return userDoc.data()?.githubAccessToken || null;
  } catch {
    return null;
  }
}
