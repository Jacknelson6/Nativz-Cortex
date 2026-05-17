/**
 * /api/public/onboarding/[token]
 *
 * Public, share-token-gated endpoint that powers the client-facing
 * stepper at /onboarding/[token]. The token IS the auth: anyone with
 * the URL can hit it. Treat it accordingly:
 *   - never echo back team / pricing / billing data
 *   - never expose other clients' rows
 *   - rate-limiting lives upstream (middleware) if needed
 *
 * GET    return { onboarding, client: { id, name, agency }, screens, progress }
 *        plus a redacted view of the row (drops created_at, updated_at, ids
 *        the public UI doesn't need)
 *
 * PATCH  { step_state?: object, advance_to?: number, complete?: boolean }
 *        - step_state: merged into the row's JSONB step_state
 *        - advance_to: explicit step index (used when a screen completes)
 *        - complete: shortcut for advance_to = doneIndex
 *        Status auto-flips to 'completed' when current_step lands on the
 *        done index (handled by advanceStep server-side).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceStep,
  describeProgress,
  getOnboardingByToken,
  patchStepState,
  replaceClientProductsFromOnboarding,
  syncBrandBasicsToClient,
} from '@/lib/onboarding/api';
import type { ProductEntry } from '@/lib/onboarding/types';
import { SCREENS, doneIndex } from '@/lib/onboarding/screens';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { notifyMilestones } from '@/lib/onboarding/milestones';
import type { OnboardingRow } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PublicClientView {
  id: string;
  name: string;
  agency: 'nativz' | 'anderson';
  /**
   * Latest brand fields from the `clients` row. The brand_basics screen
   * prefills from these so the client never sees an empty form when
   * the strategist already collected the info during onboarding setup.
   */
  brand: {
    tagline: string | null;
    what_we_sell: string | null;
    audience: string | null;
    voice: string | null;
    current_offers: string | null;
    website_url: string | null;
    logo_url: string | null;
  };
}

interface PublicOnboardingView {
  id: string;
  kind: OnboardingRow['kind'];
  platforms: string[];
  current_step: number;
  status: OnboardingRow['status'];
  step_state: Record<string, unknown>;
  share_token: string;
  started_at: string;
  completed_at: string | null;
}

function publicView(row: OnboardingRow): PublicOnboardingView {
  return {
    id: row.id,
    kind: row.kind,
    platforms: row.platforms,
    current_step: row.current_step,
    status: row.status,
    step_state: row.step_state,
    share_token: row.share_token,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

async function loadClient(client_id: string): Promise<PublicClientView | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('clients')
    .select(
      'id, name, agency, tagline, target_audience, brand_voice, current_offers, website_url, logo_url',
    )
    .eq('id', client_id)
    .single<{
      id: string;
      name: string | null;
      agency: string | null;
      tagline: string | null;
      target_audience: string | null;
      brand_voice: string | null;
      current_offers: string | null;
      website_url: string | null;
      logo_url: string | null;
    }>();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name ?? 'your brand',
    agency: getBrandFromAgency(data.agency),
    brand: {
      tagline: data.tagline,
      // Products live in `client_products`, not on the clients row.
      what_we_sell: null,
      audience: data.target_audience,
      voice: data.brand_voice,
      current_offers: data.current_offers,
      website_url: data.website_url,
      logo_url: data.logo_url,
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });

  try {
    const row = await getOnboardingByToken(token);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (row.status === 'abandoned') {
      return NextResponse.json({ error: 'cancelled' }, { status: 410 });
    }
    const client = await loadClient(row.client_id);
    if (!client) return NextResponse.json({ error: 'client missing' }, { status: 404 });

    return NextResponse.json({
      onboarding: publicView(row),
      client,
      screens: SCREENS[row.kind],
      progress: describeProgress(row),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const PatchSchema = z.object({
  step_state: z.record(z.string(), z.unknown()).optional(),
  advance_to: z.number().int().min(0).optional(),
  complete: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    let row = await getOnboardingByToken(token);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (row.status === 'abandoned') {
      return NextResponse.json({ error: 'cancelled' }, { status: 410 });
    }
    if (row.status === 'completed' && !parsed.data.step_state) {
      // Allow late edits to step_state but block re-advancing once done.
      return NextResponse.json(
        { error: 'onboarding is already completed' },
        { status: 409 },
      );
    }

    // Snapshot the row before any mutation so milestone detection can
    // compare prev/next current_step + status.
    const prev = row;

    if (parsed.data.step_state) {
      row = await patchStepState(row.id, parsed.data.step_state);

      // Bidirectional sync: brand_basics mirrors back to the clients row.
      const basics = (parsed.data.step_state as Record<string, unknown>).brand_basics;
      if (basics && typeof basics === 'object') {
        await syncBrandBasicsToClient({
          client_id: row.client_id,
          basics: basics as Parameters<typeof syncBrandBasicsToClient>[0]['basics'],
        });
      }

      // products → client_products. Replaces any prior onboarding-uploaded
      // rows; admin-created rows (source='manual') are left alone.
      const productsPatch = (parsed.data.step_state as Record<string, unknown>).products;
      if (productsPatch && typeof productsPatch === 'object') {
        const list = (productsPatch as { products?: ProductEntry[] }).products ?? [];
        const cleaned = list
          .map((p) => ({
            title: (p.title ?? '').trim(),
            url: p.url?.trim() || null,
            price_cents: p.price_cents ?? null,
            currency: p.currency?.trim() || null,
          }))
          .filter((p) => p.title.length > 0);
        await replaceClientProductsFromOnboarding({
          client_id: row.client_id,
          products: cleaned,
        });
      }
    }
    if (parsed.data.complete) {
      row = await advanceStep(row.id, { to: doneIndex(row.kind) });
    } else if (parsed.data.advance_to !== undefined) {
      row = await advanceStep(row.id, { to: parsed.data.advance_to });
    }

    const client = await loadClient(row.client_id);

    // Fire milestone notifications + completion email best-effort. We
    // intentionally await this so the response only returns once the
    // notify path has run; failures are swallowed inside notifyMilestones
    // so the caller never sees a 5xx from a flaky email or notification.
    if (row.current_step !== prev.current_step || row.status !== prev.status) {
      await notifyMilestones({
        prev,
        next: row,
        clientName: client?.name ?? null,
      });
    }

    return NextResponse.json({
      onboarding: publicView(row),
      client,
      progress: describeProgress(row),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
