import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRAND_DNA_JOB_IN_FLIGHT_STATUSES } from './constants';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Ensures a Brand DNA job exists and runs the full pipeline in the background (Next.js after()).
 * Reuses an in-flight job when one already exists for the client.
 */
export async function queueBrandDNAGeneration(params: {
  admin: AdminClient;
  clientId: string;
  websiteUrl: string;
  userId: string;
  uploadedContent?: string;
}): Promise<{ jobId: string; reused: boolean }> {
  const { admin, clientId, websiteUrl, userId, uploadedContent } = params;

  const { data: existingJob } = await admin
    .from('brand_dna_jobs')
    .select('id')
    .eq('client_id', clientId)
    .in('status', [...BRAND_DNA_JOB_IN_FLIGHT_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJob?.id) {
    return { jobId: existingJob.id, reused: true };
  }

  const { data: job, error: jobErr } = await admin
    .from('brand_dna_jobs')
    .insert({
      client_id: clientId,
      status: 'queued',
      progress_pct: 0,
      step_label: 'Queued for processing',
      website_url: websiteUrl,
      created_by: userId,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    console.error('[queueBrandDNAGeneration] Failed to insert brand_dna_jobs:', jobErr);
    throw new Error(jobErr?.message ?? 'Failed to create generation job');
  }

  after(async () => {
    const bg = createAdminClient();
    try {
      // Dynamic import keeps POST /brand-dna/generate from loading crawl/jsdom/generate until the job runs.
      const { generateBrandDNA } = await import('./generate');
      await generateBrandDNA(clientId, websiteUrl, {
        uploadedContent,
        onProgress: async (status, progressPct, stepLabel) => {
          await bg
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

      await bg
        .from('brand_dna_jobs')
        .update({
          status: 'completed',
          progress_pct: 100,
          step_label: 'Complete',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    } catch (err) {
      console.error('[queueBrandDNAGeneration] Pipeline failed:', err);
      await bg
        .from('brand_dna_jobs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
  });

  return { jobId: job.id, reused: false };
}
