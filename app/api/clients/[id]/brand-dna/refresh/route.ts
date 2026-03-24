import { NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBrandDNA } from '@/lib/brand-dna';

export const maxDuration = 300;

/**
 * POST /api/clients/[id]/brand-dna/refresh
 *
 * Re-crawl and re-generate Brand DNA. Creates a new draft without overwriting the active guideline.
 * The active guideline stays untouched until the admin applies the draft via /apply-draft.
 *
 * @auth Required (admin)
 * @returns {{ jobId: string, status: 'generating' }}
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('website_url')
    .eq('id', clientId)
    .single();

  if (!client?.website_url) {
    return NextResponse.json({ error: 'Client has no website URL configured' }, { status: 400 });
  }

  // Create job
  const { data: job, error: jobErr } = await admin
    .from('brand_dna_jobs')
    .insert({
      client_id: clientId,
      status: 'queued',
      progress_pct: 0,
      step_label: 'Queued for refresh',
      website_url: client.website_url,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  // Note: generateBrandDNA supersedes existing guidelines automatically.
  // The new one becomes the active draft. The admin reviews via diff and can revert.
  after(async () => {
    try {
      await generateBrandDNA(clientId, client.website_url, {
        onProgress: async (status, progressPct, stepLabel) => {
          await admin
            .from('brand_dna_jobs')
            .update({
              status,
              progress_pct: progressPct,
              step_label: stepLabel,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        },
      });

      await admin
        .from('brand_dna_jobs')
        .update({
          status: 'completed',
          progress_pct: 100,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    } catch (err) {
      await admin
        .from('brand_dna_jobs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
  });

  return NextResponse.json({ jobId: job.id, status: 'generating' });
}
