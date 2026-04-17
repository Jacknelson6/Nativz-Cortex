/**
 * CLI: Run Brand DNA generation for a client outside the request lifecycle.
 *
 * The in-app route (`POST /api/clients/[id]/brand-dna/generate`) uses
 * `next/server`'s `after()` to run generation in the background of a
 * request. That only works inside an HTTP handler — not from a script. This
 * CLI calls `generateBrandDNA` directly so we can kick off generation for
 * new-client onboarding without spinning up the dev server or holding an
 * admin session.
 *
 * Env:
 *   BRAND_DNA_CLIENT_ID     — Cortex `clients.id` (required)
 *   BRAND_DNA_WEBSITE_URL   — Site to crawl (required)
 *   BRAND_DNA_UPLOADED_TEXT — Optional extra context appended to the crawl
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * plus the AI keys used by `lib/brand-dna/*`.
 *
 * Example:
 *   BRAND_DNA_CLIENT_ID=dfb1b47c-a045-425e-9379-80b5675cc796 \
 *   BRAND_DNA_WEBSITE_URL=https://www.crystalcreekcattle.net/ \
 *   tsx scripts/generate-brand-dna-cli.ts
 */
import { loadEnvLocal } from './load-env-local';

async function main(): Promise<void> {
  loadEnvLocal();

  const clientId = process.env.BRAND_DNA_CLIENT_ID?.trim();
  const websiteUrl = process.env.BRAND_DNA_WEBSITE_URL?.trim();
  const uploadedContent = process.env.BRAND_DNA_UPLOADED_TEXT?.trim() || undefined;

  if (!clientId || !websiteUrl) {
    console.error('[brand-dna] BRAND_DNA_CLIENT_ID and BRAND_DNA_WEBSITE_URL are required');
    process.exit(1);
  }

  // Defer heavy imports until env is loaded so lib/supabase/admin sees the keys.
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { generateBrandDNA } = await import('@/lib/brand-dna/generate');

  const admin = createAdminClient();

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single();
  if (clientErr || !client) {
    console.error('[brand-dna] client not found:', clientErr?.message ?? clientId);
    process.exit(1);
  }
  console.log(`[brand-dna] client: ${client.name ?? client.id} → ${websiteUrl}`);

  const { data: job, error: jobErr } = await admin
    .from('brand_dna_jobs')
    .insert({
      client_id: clientId,
      status: 'queued',
      progress_pct: 0,
      step_label: 'Queued (CLI)',
      website_url: websiteUrl,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    console.error('[brand-dna] failed to create job:', jobErr?.message);
    process.exit(1);
  }

  console.log(`[brand-dna] job ${job.id} — starting generateBrandDNA (may take several minutes)…`);

  const started = Date.now();
  try {
    await generateBrandDNA(clientId, websiteUrl, {
      uploadedContent,
      onProgress: async (status, pct, label) => {
        console.log(`[brand-dna] ${pct}% — ${label} (${status})`);
        await admin
          .from('brand_dna_jobs')
          .update({ status, progress_pct: pct, step_label: label })
          .eq('id', job.id);
      },
    });

    await admin
      .from('brand_dna_jobs')
      .update({
        status: 'completed',
        progress_pct: 100,
        step_label: 'Done',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`[brand-dna] done in ${secs}s`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[brand-dna] generation failed:', msg);
    await admin
      .from('brand_dna_jobs')
      .update({
        status: 'failed',
        step_label: `Error: ${msg.slice(0, 200)}`,
        error_message: msg,
      })
      .eq('id', job.id);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
