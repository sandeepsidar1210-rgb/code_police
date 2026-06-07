import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Octokit } from "@octokit/rest";

/**
 * GET /api/auth/github/status
 * Check if GitHub is connected via Clerk OAuth
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    const clerk = await clerkClient();

    // Check if user has GitHub connected
    const user = await clerk.users.getUser(userId);
    const githubAccount = user.externalAccounts?.find(
      (account) => account.provider === "github"
    );

    if (!githubAccount) {
      return NextResponse.json({ connected: false });
    }

    // Try to get the OAuth token to verify it's still valid
    try {
      const tokens = await clerk.users.getUserOauthAccessToken(userId, "oauth_github");
      if (!tokens.data || tokens.data.length === 0) {
        return NextResponse.json({ connected: false });
      }

      // Optionally fetch user info from GitHub for avatar/username
      const octokit = new Octokit({ auth: tokens.data[0].token });
      const { data: githubUser } = await octokit.users.getAuthenticated();

      return NextResponse.json({
        connected: true,
        username: githubUser.login,
        avatar_url: githubUser.avatar_url,
        provider: "clerk",
      });
    } catch {
      // Token might be expired or revoked
      return NextResponse.json({ connected: false });
    }
  } catch (error) {
    console.error("[GitHub:Status] Error:", error);
    return NextResponse.json({ connected: false }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/github/status
 * For Clerk OAuth, users need to disconnect via Clerk's UserProfile
 * This endpoint just returns instructions
 */
export async function DELETE() {
  return NextResponse.json({
    success: false,
    message: "To disconnect GitHub, please go to your account settings in the user menu and manage connected accounts there."
  });
}
