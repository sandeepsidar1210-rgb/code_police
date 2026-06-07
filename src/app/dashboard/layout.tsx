import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";

// Force dynamic rendering for all dashboard pages - requires Clerk auth at runtime
export const dynamic = 'force-dynamic';

/**
 * ============================================================================
 * DASHBOARD LAYOUT
 * ============================================================================
 * Layout wrapper for all dashboard pages with authentication check.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  // Redirect to sign-in if not authenticated
  if (!userId) {
    redirect("/sign-in");
  }

  return <DashboardShell>{children}</DashboardShell>;
}


