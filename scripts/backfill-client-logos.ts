/**
 * One-shot backfill: re-resolve `clients.logo_url` for every client whose
 * current logo is missing, came from the legacy Google globe / Clearbit
 * fallback, or was sourced from `favicon` (PRD A wants social where possible).
 *
 * Walks the same Instagram -> Facebook -> YouTube -> TikTok -> LinkedIn -> favicon
 * chain that `app/api/clients/analyze-url` uses. Reads handles from the
 * `social_profiles` table; falls back to website-based favicon resolution.
 *
 * Rate-limited at 1 client / 2s (no IP-level pressure on Instagram or jina).
 *
 * Usage: npx tsx scripts/backfill-client-logos.ts
 *        npx tsx scripts/backfill-client-logos.ts --only-source=favicon
 *        npx tsx scripts/backfill-client-logos.ts --dry-run
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { resolveBrandAvatar } from '../lib/scrapers/social-avatar';

const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlySource = args.find((a) => a.startsWith('--only-source='))?.split('=')[1];

const STALE_HOSTS = ['google.com/s2', 'gstatic.com/faviconV2', 'logo.clearbit.com'];

function isLegacyFallback(logoUrl: string | null): boolean {
  if (!logoUrl) return true;
  return STALE_HOSTS.some((h) => logoUrl.includes(h));
}

async function main() {
  console.log('Loading clients…');
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, website_url, logo_url, logo_source')
    .order('name');

  if (error || !clients) {
    console.error('Failed to load clients:', error);
    process.exit(1);
  }

  const candidates = clients.filter((c) => {
    if (onlySource) return c.logo_source === onlySource;
    return c.logo_source === null || c.logo_source === 'favicon' || isLegacyFallback(c.logo_url);
  });

  console.log(`Found ${candidates.length} candidate client(s) of ${clients.length} total.${dryRun ? ' (dry-run)' : ''}`);

  let upgraded = 0;
  let unchanged = 0;
  let failed = 0;

  for (const c of candidates) {
    const { data: profiles } = await supabase
      .from('social_profiles')
      .select('platform, username')
      .eq('client_id', c.id);

    const handles: Record<string, string | undefined> = {};
    for (const p of profiles ?? []) {
      if (p?.platform && p?.username) handles[p.platform] = p.username;
    }

    if (!c.website_url && Object.keys(handles).length === 0) {
      console.log(`  - ${c.name}: skip (no website, no handles)`);
      continue;
    }

    const resolved = await resolveBrandAvatar({
      website: c.website_url,
      socials: {
        instagram: handles.instagram ?? null,
        facebook: handles.facebook ?? null,
        youtube: handles.youtube ?? null,
        tiktok: handles.tiktok ?? null,
      },
    });

    if (!resolved.url) {
      failed++;
      console.log(`  x ${c.name}: nothing usable`);
    } else if (resolved.url === c.logo_url && resolved.source === c.logo_source) {
      unchanged++;
      console.log(`  = ${c.name}: already on ${resolved.source}`);
    } else {
      upgraded++;
      const prevLabel = c.logo_source ?? (c.logo_url ? 'legacy' : 'none');
      console.log(`  + ${c.name}: ${prevLabel} -> ${resolved.source}`);
      if (!dryRun) {
        const { error: updErr } = await supabase
          .from('clients')
          .update({
            logo_url: resolved.url,
            logo_source: resolved.source,
            logo_resolved_at: new Date().toISOString(),
          })
          .eq('id', c.id);
        if (updErr) console.error(`    update failed:`, updErr);
      }
    }

    // 2s rate-limit between clients.
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\nDone.');
  console.log(`  upgraded:  ${upgraded}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  failed:    ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
