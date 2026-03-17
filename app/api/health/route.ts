import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Health check endpoint for uptime monitoring (SOC 2 A1.3).
 * Returns 200 with timestamp. No auth required.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
