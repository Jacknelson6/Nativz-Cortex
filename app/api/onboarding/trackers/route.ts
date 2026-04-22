import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const CreateBody = z.object({
  client_id: z.string().uuid(),
  service: z.string().trim().min(1).max(60),
  title: z.string().trim().max(120).optional(),
});

/**
 * GET /api/onboarding/trackers — list all trackers across all clients,
 * with client name + slug joined for the list page. Admin-only.
 * Optional ?client_id= filter.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const clientId = new URL(request.url).searchParams.get('client_id');
    let query = admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, share_token, started_at, completed_at, created_at, updated_at, clients!inner(name, slug, logo_url)')
      .order('created_at', { ascending: false });
    if (clientId) query = query.eq('client_id', clientId);

    const { data, error } = await query;
    if (error) {
      console.error('GET /api/onboarding/trackers error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ trackers: data ?? [] });
  } catch (error) {
    console.error('GET /api/onboarding/trackers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/onboarding/trackers — create a new tracker for a client +
 * service. DB unique constraint prevents duplicates on (client_id, service).
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin, userId } = gate;

    const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('onboarding_trackers')
      .insert({
        client_id: parsed.data.client_id,
        service: parsed.data.service,
        title: parsed.data.title ?? null,
        created_by: userId,
        started_at: new Date().toISOString(),
      })
      .select('id, client_id, service, title, status, share_token, started_at, completed_at, created_at, updated_at')
      .single();

    if (error) {
      // Unique-violation = tracker already exists for this client+service.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A ${parsed.data.service} onboarding already exists for this client.` },
          { status: 409 },
        );
      }
      console.error('POST /api/onboarding/trackers error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tracker: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/trackers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
