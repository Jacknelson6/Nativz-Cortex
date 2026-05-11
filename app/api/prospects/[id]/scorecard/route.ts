// SPY-04 T14 + T15: generate + list prospect scorecard share links.
//
// POST: compute scorecard from latest analysis, render PDF, upload to
// Supabase Storage, insert a share-link row with the JSONB snapshot, write
// a touchpoint, return { token, public_url, signed_pdf_url, snapshot }.
//
// GET: list active + (?include_archived=true) share links for the prospect.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestAnalysis } from '@/lib/prospects/analysis-queries';
import { computeScorecard } from '@/lib/prospects/checklist';
import { renderProspectScorecardPdf } from '@/lib/prospects/scorecard-pdf';
import { uploadScorecardPdf, getSignedPdfUrl } from '@/lib/prospects/scorecard-storage';
import {
  getBenchmarkById,
  getLatestBenchmark,
} from '@/lib/prospects/benchmark-orchestrator';
import type { ProspectCompetitorBenchmarkRow } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PostSchema = z.object({
  name: z.string().trim().max(120).optional(),
  // SPY-05 T21: optional benchmark to bake into the PDF as Round 2.
  // `null` skips the section entirely; omitted = pull latest succeeded/partial.
  include_benchmark_id: z.string().uuid().nullable().optional(),
});

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id };
}

function publicUrl(request: NextRequest, token: string): string {
  const baseUrl =
    request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
  return `${baseUrl}/shared/prospect/${token}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: prospect } = await admin
      .from('prospects')
      .select('id, brand_name')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const analysis = await getLatestAnalysis(id);
    if (!analysis) {
      return NextResponse.json(
        { error: 'No analysis available — run analysis first.' },
        { status: 409 },
      );
    }
    if (analysis.status === 'failed') {
      return NextResponse.json(
        { error: 'Latest analysis failed — re-run before generating a scorecard.' },
        { status: 409 },
      );
    }

    const snapshot = computeScorecard(analysis);
    const token = crypto.randomBytes(24).toString('hex');

    // Resolve benchmark to bake into Round 2.
    // - explicit `null` → skip
    // - explicit id → look it up (verify ownership)
    // - omitted → pull latest succeeded/partial benchmark
    let benchmark: ProspectCompetitorBenchmarkRow | null = null;
    if (parsed.data.include_benchmark_id === undefined) {
      const latest = await getLatestBenchmark(id);
      if (
        latest &&
        (latest.status === 'succeeded' || latest.status === 'partial')
      ) {
        benchmark = latest;
      }
    } else if (parsed.data.include_benchmark_id) {
      const fetched = await getBenchmarkById(parsed.data.include_benchmark_id);
      if (fetched && fetched.prospect_id === id) {
        benchmark = fetched;
      }
    }

    const pdfBuffer = await renderProspectScorecardPdf({
      brandName: prospect.brand_name,
      handle: analysis.handle,
      platform: analysis.platform,
      snapshot,
      benchmark,
    });

    let pdfStoragePath: string | null = null;
    let signedPdfUrl: string | null = null;
    if (pdfBuffer) {
      try {
        const uploaded = await uploadScorecardPdf(id, token, pdfBuffer);
        pdfStoragePath = uploaded.path;
        signedPdfUrl = uploaded.signedUrl;
      } catch (err) {
        // Soft-fail PDF: still return the link with the JSON snapshot so the
        // public page renders. Strategists can re-run if they need the PDF.
        console.error('[prospect-scorecard] PDF upload failed', err);
      }
    }

    const { data: link, error: insertError } = await admin
      .from('prospect_share_links')
      .insert({
        prospect_id: id,
        analysis_id: analysis.id,
        token,
        pdf_storage_path: pdfStoragePath,
        scorecard_snapshot: snapshot,
        name: parsed.data.name ?? null,
        created_by: auth.userId,
      })
      .select('id, token, expires_at, created_at')
      .single();

    if (insertError || !link) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to create share link' },
        { status: 500 },
      );
    }

    // Touchpoint: kind='note' so it's visible in the activity feed without
    // polluting the state_change rail.
    await admin.from('prospect_touchpoints').insert({
      prospect_id: id,
      kind: 'note',
      body: parsed.data.name
        ? `Generated scorecard "${parsed.data.name}"`
        : 'Generated scorecard',
      metadata: { share_link_id: link.id, token },
      created_by: auth.userId,
    });

    return NextResponse.json({
      ok: true,
      token,
      public_url: publicUrl(request, token),
      signed_pdf_url: signedPdfUrl,
      expires_at: link.expires_at,
      created_at: link.created_at,
      snapshot,
    });
  } catch (err) {
    console.error('POST /api/prospects/[id]/scorecard error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const includeArchived = request.nextUrl.searchParams.get('include_archived') === 'true';

    const admin = createAdminClient();

    const { data: prospect } = await admin
      .from('prospects')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    let query = admin
      .from('prospect_share_links')
      .select(
        'id, token, name, pdf_storage_path, scorecard_snapshot, expires_at, archived_at, created_at',
      )
      .eq('prospect_id', id)
      .order('created_at', { ascending: false });
    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data: links } = await query;

    // Pre-sign PDFs in parallel for the list view.
    const signed = await Promise.all(
      (links ?? []).map(async (l) => ({
        id: l.id,
        token: l.token,
        name: l.name,
        public_url: publicUrl(request, l.token),
        signed_pdf_url: l.pdf_storage_path ? await getSignedPdfUrl(l.pdf_storage_path) : null,
        expires_at: l.expires_at,
        archived_at: l.archived_at,
        created_at: l.created_at,
        scorecard_snapshot: l.scorecard_snapshot,
      })),
    );

    // View counts in a single grouped query.
    const ids = signed.map((l) => l.id);
    let viewCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: views } = await admin
        .from('prospect_share_link_views')
        .select('share_link_id')
        .in('share_link_id', ids);
      viewCounts = (views ?? []).reduce<Record<string, number>>((acc, v) => {
        const k = v.share_link_id as string;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    }

    return NextResponse.json({
      links: signed.map((l) => ({ ...l, view_count: viewCounts[l.id] ?? 0 })),
    });
  } catch (err) {
    console.error('GET /api/prospects/[id]/scorecard error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
