import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBrandDNA } from '@/lib/brand-dna';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';

const bodySchema = z.object({
  websiteUrl: z
    .string()
    .min(1, 'Website URL is required')
    .transform((s) => normalizeWebsiteUrl(s))
    .refine((s) => isValidWebsiteUrl(s), { message: 'Invalid website URL' }),
  uploadedContent: z.string().nullish().optional(),
});

export const maxDuration = 300;

/**
 * POST /api/clients/[id]/brand-dna/generate
 *
 * Kick off Brand DNA generation for a client. Creates a job record and processes in background.
 *
 * @auth Required (admin)
 * @body websiteUrl - URL to crawl
 * @body uploadedContent - Optional text from uploaded files
 * @returns {{ jobId: string, status: 'generating' }}
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: 10 requests per minute per user for AI endpoints
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldMsg = flat.fieldErrors.websiteUrl?.[0] ?? flat.formErrors[0];
      return NextResponse.json(
        {
          error: fieldMsg ?? 'Invalid input',
          details: flat.fieldErrors,
        },
        { status: 400 },
      );
    }

    const uploadedContent =
      parsed.data.uploadedContent === null || parsed.data.uploadedContent === undefined
        ? undefined
        : parsed.data.uploadedContent;

    const admin = createAdminClient();

    // Verify client exists
    const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Create job record
    const { data: job, error: jobErr } = await admin
      .from('brand_dna_jobs')
      .insert({
        client_id: clientId,
        status: 'queued',
        progress_pct: 0,
        step_label: 'Queued for processing',
        website_url: parsed.data.websiteUrl,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (jobErr || !job) {
      console.error('[brand-dna/generate] Failed to insert brand_dna_jobs:', jobErr);
      return NextResponse.json(
        {
          error: 'Failed to create generation job',
          hint: jobErr?.message ?? 'Check that migration 040 (brand_dna_jobs) is applied.',
        },
        { status: 500 },
      );
    }

    const websiteUrl = parsed.data.websiteUrl;

    // Process in background
    after(async () => {
      try {
        await generateBrandDNA(clientId, websiteUrl, {
          uploadedContent,
          onProgress: async (status, progressPct, stepLabel) => {
            await admin
              .from('brand_dna_jobs')
              .update({ status, progress_pct: progressPct, step_label: stepLabel })
              .eq('id', job.id);
          },
        });

        await admin
          .from('brand_dna_jobs')
          .update({ status: 'completed', progress_pct: 100, step_label: 'Complete', completed_at: new Date().toISOString() })
          .eq('id', job.id);
      } catch (err) {
        console.error('[brand-dna/generate] Pipeline failed:', err);
        await admin
          .from('brand_dna_jobs')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', job.id);
      }
    });

    return NextResponse.json({ jobId: job.id, status: 'generating' });
  } catch (err) {
    console.error('[brand-dna/generate] Unhandled error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
