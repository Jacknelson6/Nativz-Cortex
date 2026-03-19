import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBrandDNA } from '@/lib/brand-dna';
import { rateLimitByUser } from '@/lib/security/rate-limit';

const bodySchema = z.object({
  websiteUrl: z.string().url(),
  uploadedContent: z.string().optional(),
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

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  // Process in background
  after(async () => {
    try {
      await generateBrandDNA(clientId, parsed.data.websiteUrl, {
        uploadedContent: parsed.data.uploadedContent,
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
}
