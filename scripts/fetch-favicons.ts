/**
 * Fetch favicons / apple-touch-icons for all clients with websites.
 * Updates logo_url in Supabase for clients that don't have one set.
 *
 * Usage: npx tsx scripts/fetch-favicons.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Parse .env.local ──────────────────────────────────────────────────────────
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

// ── Favicon extraction ────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return '';
  }
}

async function findFavicon(websiteUrl: string): Promise<string | null> {
  const domain = new URL(websiteUrl).hostname;

  try {
    // 1. Fetch the homepage HTML and look for high-quality icons
    const res = await fetchWithTimeout(websiteUrl);
    if (res.ok) {
      const html = await res.text();

      // Look for apple-touch-icon (usually 180x180, highest quality)
      const appleTouchMatch = html.match(/<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i)
        || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i);
      if (appleTouchMatch?.[1]) {
        const url = resolveUrl(websiteUrl, appleTouchMatch[1]);
        if (url) {
          // Verify it's accessible
          try {
            const check = await fetchWithTimeout(url, 5000);
            if (check.ok) return url;
          } catch { /* fall through */ }
        }
      }

      // Look for large favicon (32x32+)
      const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
        || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
      if (iconMatch?.[1] && !iconMatch[1].endsWith('.ico')) {
        const url = resolveUrl(websiteUrl, iconMatch[1]);
        if (url) {
          try {
            const check = await fetchWithTimeout(url, 5000);
            if (check.ok) return url;
          } catch { /* fall through */ }
        }
      }

      // Check og:image as fallback (can be a logo)
      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogMatch?.[1]) {
        const url = resolveUrl(websiteUrl, ogMatch[1]);
        if (url) {
          // og:image exists but might be too large/not a logo — still use it as last resort from HTML
          try {
            const check = await fetchWithTimeout(url, 5000);
            if (check.ok) return url;
          } catch { /* fall through */ }
        }
      }
    }
  } catch {
    // Homepage fetch failed
  }

  // 2. Try common favicon paths directly
  const commonPaths = [
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/favicon-32x32.png',
    '/favicon.png',
  ];

  for (const path of commonPaths) {
    const url = `https://${domain}${path}`;
    try {
      const check = await fetchWithTimeout(url, 5000);
      if (check.ok) {
        const ct = check.headers.get('content-type') || '';
        if (ct.includes('image')) return url;
      }
    } catch { /* continue */ }
  }

  // 3. Fall back to Google's favicon service (always works, 128px)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, website_url, logo_url')
    .eq('is_active', true)
    .not('website_url', 'is', null)
    .order('name');

  if (error) {
    console.error('Failed to fetch clients:', error.message);
    process.exit(1);
  }

  console.log(`Found ${clients.length} clients with websites\n`);

  let updated = 0;
  let skipped = 0;

  for (const client of clients) {
    const hasUploadedLogo = client.logo_url?.includes('supabase.co/storage');

    if (hasUploadedLogo) {
      console.log(`⏭  ${client.name} — has uploaded logo, skipping`);
      skipped++;
      continue;
    }

    console.log(`🔍 ${client.name} — ${client.website_url}`);
    const favicon = await findFavicon(client.website_url);

    if (favicon) {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ logo_url: favicon })
        .eq('id', client.id);

      if (updateError) {
        console.log(`   ❌ Failed to update: ${updateError.message}`);
      } else {
        console.log(`   ✅ ${favicon}`);
        updated++;
      }
    } else {
      console.log(`   ⚠️  No favicon found`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch(console.error);
