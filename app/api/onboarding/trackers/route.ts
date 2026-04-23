import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';
import { ensureZernioProfile } from '@/lib/onboarding/ensure-zernio-profile';

// Two create shapes:
//   1. Real tracker — needs client_id + service.
//   2. Template    — is_template=true, template_name + service, no client.
const CreateBody = z.union([
  z.object({
    is_template: z.literal(false).optional(),
    client_id: z.string().uuid(),
    service: z.string().trim().min(1).max(60),
    title: z.string().trim().max(120).optional(),
  }),
  z.object({
    is_template: z.literal(true),
    template_name: z.string().trim().min(1).max(120),
    service: z.string().trim().min(1).max(60),
  }),
]);

/**
 * GET /api/onboarding/trackers — list all trackers across all clients,
 * with client name + slug joined for the list page. Admin-only.
 * Optional query params:
 *   ?client_id=<uuid>     — scope to one client
 *   ?is_template=true|false — default false (real trackers only).
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const params = new URL(request.url).searchParams;
    const clientId = params.get('client_id');
    const isTemplate = params.get('is_template') === 'true';

    let query = admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, share_token, started_at, completed_at, is_template, template_name, created_at, updated_at, clients(name, slug, logo_url)')
      .eq('is_template', isTemplate)
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
 * POST /api/onboarding/trackers — create a real tracker OR a template.
 * DB unique constraint prevents duplicates on (client_id, service) for
 * real trackers; templates are allowed in unlimited number per service
 * because NULL client_id is distinct in Postgres unique indexes.
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

    const body = parsed.data;
    const insert = body.is_template
      ? {
          client_id: null,
          service: body.service,
          template_name: body.template_name,
          is_template: true,
          created_by: userId,
        }
      : {
          client_id: body.client_id,
          service: body.service,
          title: body.title ?? null,
          created_by: userId,
          started_at: new Date().toISOString(),
        };

    const { data, error } = await admin
      .from('onboarding_trackers')
      .insert(insert)
      .select('id, client_id, service, title, status, share_token, started_at, completed_at, is_template, template_name, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A ${body.service} onboarding already exists for this client.` },
          { status: 409 },
        );
      }
      console.error('POST /api/onboarding/trackers error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Eagerly ensure this client has a Zernio profile so the later "Connect
    // TikTok" tap on the public page completes faster (no Zernio profile
    // create round-trip at click time). Fire-and-forget: a failure here
    // (Zernio down, network blip) should never fail the tracker creation —
    // the connect endpoint will retry via ensureZernioProfile anyway.
    if (!body.is_template && data && data.client_id) {
      const { data: clientRow } = await admin
        .from('clients')
        .select('name, late_profile_id')
        .eq('id', data.client_id)
        .single();
      if (clientRow && !clientRow.late_profile_id) {
        void ensureZernioProfile(admin, data.client_id, clientRow.name ?? 'Client').catch(
          (err) => console.error('[onboarding] eager ensureZernioProfile failed:', err),
        );
      }
    }

    return NextResponse.json({ tracker: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/trackers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
