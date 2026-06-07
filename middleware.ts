import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * ============================================================================
 * CLERK MIDDLEWARE - CENTRALIZED AUTHENTICATION
 * ============================================================================
 * This middleware protects routes and handles authentication across the app.
 * 
 * Route Protection:
 * - Public routes: Landing page, sign-in, sign-up, public API endpoints
 * - Protected routes: Dashboard and all sub-routes, authenticated API endpoints
 * 
 * The middleware runs on every request and ensures:
 * 1. Public routes are accessible to everyone
 * 2. Protected routes redirect to sign-in if not authenticated
 * 3. API routes return 401 if not authenticated (handled in route handlers)
 */

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",                    // Landing page
  "/sign-in(.*)",         // Sign in page and sub-routes
  "/sign-up(.*)",         // Sign up page and sub-routes
  "/api/webhooks/(.*)",   // Webhook endpoints (verified by webhook secret)
]);

export default clerkMiddleware(async (auth, request) => {
  // Protect all routes except public ones
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
