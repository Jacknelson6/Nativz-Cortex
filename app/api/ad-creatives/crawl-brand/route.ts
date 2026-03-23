import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeBrandAndProducts } from '@/lib/ad-creatives/scrape-brand';
import { buildAdWizardContextFromBrandDNA } from '@/lib/ad-creatives/brand-dna-context';
import { findOrCreateEphemeralBrandClient } from '@/lib/ad-creatives/ephemeral-brand-client';
import { queueBrandDNAGeneration } from '@/lib/brand-dna/queue-generation';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';
import { rateLimitByUser } from '@/lib/security/rate-limit';

export const maxDuration = 300;

const bodySchema = z
  .object({
    url: z.string().url().optional(),
    clientId: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.clientId) || Boolean(d.url), {
    message: 'Provide clientId and/or url',
  });

type AdminClient = ReturnType<typeof createAdminClient>;

const DNA_JOB_ACTIVE = ['queued', 'crawling', 'extracting', 'analyzing', 'compiling'] as const;

/**
 * Prefer Brand DNA (draft/active) for ad wizard — same source as Brand DNA cards.
 */
async function loadBrandDnaWizardContext(admin: AdminClient, clientId: string) {
  const { data: clientRow } = await admin
    .from('clients')
    .select('name, website_url, brand_dna_status')
    .eq('id', clientId)
    .single();

  const status = clientRow?.brand_dna_status;
  if (status !== 'draft' && status !== 'active') return null;
  if (!clientRow?.name) return null;

  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('metadata')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guideline?.metadata) return null;

  const meta = guideline.metadata as unknown as BrandGuidelineMetadata;
  return buildAdWizardContextFromBrandDNA(clientRow.name, clientRow.website_url, meta);
}

function hostnameLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Website';
  }
}

/**
 * POST /api/ad-creatives/crawl-brand
 *
 * Uses Brand DNA (draft/active) when present. Otherwise kicks off the same full Brand DNA
 * pipeline as /api/clients/[id]/brand-dna/generate, returns quick homepage scrape immediately,
 * and includes clientId for polling (including roster-hidden URL-only clients).
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { url: bodyUrl, clientId: bodyClientId } = parsed.data;
  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const organizationId = userRow?.organization_id;
  if (!bodyClientId && !organizationId) {
    return NextResponse.json(
      { error: 'Your account has no organization; open ad creatives from a saved client or contact an admin.' },
      { status: 400 },
    );
  }

  let effectiveClientId = bodyClientId ?? null;
  let effectiveUrl = bodyUrl ? normalizeWebsiteUrl(bodyUrl) : '';

  if (effectiveClientId) {
    const { data: crow } = await admin.from('clients').select('id').eq('id', effectiveClientId).maybeSingle();
    if (!crow) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
  }

  if (!effectiveUrl && effectiveClientId) {
    const { data: crow } = await admin.from('clients').select('website_url').eq('id', effectiveClientId).single();
    const n = normalizeWebsiteUrl(crow?.website_url ?? '');
    if (isValidWebsiteUrl(n)) effectiveUrl = n;
  }

  if (!effectiveUrl || !isValidWebsiteUrl(effectiveUrl)) {
    return NextResponse.json(
      {
        error:
          'Add a website URL on the client profile or generate Brand DNA so we can load brand context.',
      },
      { status: 400 },
    );
  }

  if (!effectiveClientId && organizationId) {
    effectiveClientId = await findOrCreateEphemeralBrandClient(
      admin,
      organizationId,
      effectiveUrl,
      hostnameLabel(effectiveUrl),
    );
  }

  if (!effectiveClientId) {
    return NextResponse.json({ error: 'Could not resolve client' }, { status: 400 });
  }

  const fromDna = await loadBrandDnaWizardContext(admin, effectiveClientId);
  if (fromDna) {
    return NextResponse.json({
      status: 'cached',
      source: 'brand_dna',
      clientId: effectiveClientId,
      brand: fromDna.brand,
      products: fromDna.products,
      mediaUrls: fromDna.mediaUrls,
    });
  }

  const rl = rateLimitByUser(user.id, '/api/clients/brand-dna/generate', 'ai');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  let quickBrand = null;
  let quickProducts: unknown[] = [];
  try {
    const quick = await scrapeBrandAndProducts(effectiveUrl);
    quickBrand = quick.brand;
    quickProducts = quick.products;
  } catch {
    // Homepage scan failed — still queue Brand DNA
  }

  let jobId: string | undefined;
  try {
    const q = await queueBrandDNAGeneration({
      admin,
      clientId: effectiveClientId,
      websiteUrl: effectiveUrl,
      userId: user.id,
    });
    jobId = q.jobId;
  } catch (e) {
    console.error('[crawl-brand] queue Brand DNA failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to start Brand DNA generation' },
      { status: 500 },
    );
  }

  if (quickBrand) {
    return NextResponse.json({
      status: 'generating',
      source: 'live_scrape',
      clientId: effectiveClientId,
      jobId,
      brand: quickBrand,
      products: quickProducts,
      mediaUrls: [],
    });
  }

  return NextResponse.json({
    status: 'generating',
    source: 'live_scrape',
    clientId: effectiveClientId,
    jobId,
    brand: null,
    products: [],
    mediaUrls: [],
  });
}

/**
 * GET /api/ad-creatives/crawl-brand?clientId=X
 *
 * Poll until Brand DNA (draft/active) is available, or surface job failure.
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const fromDna = await loadBrandDnaWizardContext(admin, clientId);
  if (fromDna) {
    return NextResponse.json({
      status: 'ready',
      source: 'brand_dna',
      clientId,
      brand: fromDna.brand,
      products: fromDna.products,
      mediaUrls: fromDna.mediaUrls,
    });
  }

  const { data: lastJob } = await admin
    .from('brand_dna_jobs')
    .select('status, error_message, step_label, progress_pct')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastJob?.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      clientId,
      error: lastJob.error_message ?? 'Brand DNA generation failed',
    });
  }

  if (lastJob && (DNA_JOB_ACTIVE as readonly string[]).includes(lastJob.status)) {
    return NextResponse.json({
      status: 'generating',
      clientId,
      stepLabel: lastJob.step_label,
      progressPct: lastJob.progress_pct,
    });
  }

  const { data: crow } = await admin.from('clients').select('brand_dna_status').eq('id', clientId).maybeSingle();
  if (crow?.brand_dna_status === 'generating') {
    return NextResponse.json({ status: 'generating', clientId });
  }

  // Client already has a kit but wizard context failed to build (race / metadata) — do not poll as "generating" forever
  if (crow?.brand_dna_status === 'draft' || crow?.brand_dna_status === 'active') {
    return NextResponse.json({
      status: 'ready',
      source: 'brand_dna',
      clientId,
      brand: null,
      products: [],
      mediaUrls: [],
    });
  }

  // Job row shows completion but guideline lookup missed above — unstick polling
  if (lastJob?.status === 'completed') {
    return NextResponse.json({
      status: 'ready',
      source: 'live_scrape',
      clientId,
      brand: null,
      products: [],
      mediaUrls: [],
    });
  }

  return NextResponse.json({ status: 'generating', clientId });
}
