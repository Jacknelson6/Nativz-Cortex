// SPY-01 T09: GET /api/prospects — list + counts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { listProspects } from '@/lib/prospects/queries';
import { LIFECYCLE_STATES } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

const StateEnum = z.enum(LIFECYCLE_STATES as [string, ...string[]]);

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const stateRaw = url.searchParams.get('state');
  const q = url.searchParams.get('q') ?? undefined;
  const stateParsed = stateRaw ? StateEnum.safeParse(stateRaw) : null;

  try {
    const result = await listProspects({
      state: stateParsed?.success ? (stateParsed.data as never) : undefined,
      q: q ?? undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
