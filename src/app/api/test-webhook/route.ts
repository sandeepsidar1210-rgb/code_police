import { NextRequest, NextResponse } from 'next/server';

/**
 * Test webhook endpoint to verify Railway deployment is accessible
 * Test with: curl https://ghosthunter-production.up.railway.app/api/test-webhook
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    url: req.url,
    headers: {
      'user-agent': req.headers.get('user-agent'),
      'x-forwarded-for': req.headers.get('x-forwarded-for'),
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    return NextResponse.json({
      status: 'ok',
      message: 'Webhook POST received successfully',
      timestamp: new Date().toISOString(),
      receivedData: body,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to parse webhook body',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 400 });
  }
}
