import { NextResponse } from 'next/server';

/**
 * Health check endpoint
 * Returns the status of the application and its dependencies
 */
export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      clerk: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      firebase: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      github: !!process.env.GITHUB_CLIENT_ID,
      gemini: !!process.env.GOOGLE_API_KEY,
    },
  };

  return NextResponse.json(health);
}
