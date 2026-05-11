// scripts/reanalyze-viral-video.ts
// Re-run VFF-05 analysis on a single viral_videos row.
//
// Usage:
//   npx tsx scripts/reanalyze-viral-video.ts <video_id>
//   npx tsx scripts/reanalyze-viral-video.ts <video_id> --force
//
// --force wipes existing viral_video_formats rows (source='llm') + clears the
// embedding before re-analysis. Without --force the analyzer overwrites the
// narrative columns but leaves untouched a pre-existing embedding if Gemini
// fails to regenerate one.

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually (matches the project pattern).
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let val = trimmed.slice(eqIdx + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local missing is fine in CI; helper will surface missing-env errors.
}

async function main() {
  const args = process.argv.slice(2);
  const videoId = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force');

  if (!videoId) {
    console.error('Usage: npx tsx scripts/reanalyze-viral-video.ts <video_id> [--force]');
    process.exit(1);
  }

  const { createAdminClient } = await import('../lib/supabase/admin');
  const { analyzeViralVideo } = await import('../lib/analytics/analyze-viral-video');

  const admin = createAdminClient();

  if (force) {
    await admin.from('viral_video_formats').delete().eq('video_id', videoId).eq('source', 'llm');
    await admin.from('viral_videos').update({ embedding: null }).eq('id', videoId);
  }

  // Force-reset to 'analyzing' so the analyzer treats this as a fresh run.
  await admin
    .from('viral_videos')
    .update({ analysis_status: 'analyzing', gate_metadata: {} })
    .eq('id', videoId);

  console.log(`Analyzing ${videoId}${force ? ' (forced)' : ''}…`);
  const t0 = Date.now();
  try {
    const out = await analyzeViralVideo(videoId, { force });
    const elapsed = Date.now() - t0;
    console.log(JSON.stringify(out, null, 2));
    console.log(`\nstatus=${out.status} latency=${elapsed}ms cost=$${out.cost_usd.toFixed(4)}`);
    if (out.status !== 'analyzed') {
      process.exit(1);
    }
  } catch (e) {
    console.error('analyzeViralVideo threw:', e);
    process.exit(2);
  }
}

main();
