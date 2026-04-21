import { NextResponse } from 'next/server';

/**
 * POST /api/analytics/competitors/discover — RETIRED.
 *
 * NAT-57 follow-up (2026-04-21) killed the AI-competitor-discovery flow.
 * LLMs hallucinated brand names (and worse, social handles), producing
 * bad competitor scrapes that polluted the analytics. The new contract:
 * competitor brands come from (a) the client's saved competitor list on
 * the brand profile or (b) an explicit admin paste. No AI guessing.
 *
 * Route kept so any stray client code fails loud (410) instead of silent.
 * Remove once we're confident nothing still pokes at it.
 */
export async function POST(request: Request) {
  // Log stragglers so we can track down any lingering caller post-deploy.
  // Route is static 410 — no auth check needed; leaks nothing.
  console.warn(
    '[discover-competitors] retired endpoint hit',
    JSON.stringify({
      referer: request.headers.get('referer'),
      ua: request.headers.get('user-agent'),
    }),
  );
  return NextResponse.json(
    {
      error:
        'AI competitor discovery was retired in NAT-57. Add competitors manually via the brand profile.',
    },
    { status: 410 },
  );
}
