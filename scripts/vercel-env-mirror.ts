#!/usr/bin/env tsx
/**
 * Mirror selected .env.local keys to Vercel project environment variables
 * via the Vercel REST API — no CLI needed.
 *
 *   VERCEL_API_TOKEN=xxx VERCEL_PROJECT_ID=prj_xxx VERCEL_TEAM_ID=team_xxx \
 *     npx tsx scripts/vercel-env-mirror.ts [--envs=production,preview] [--dry-run]
 *
 * - VERCEL_API_TOKEN: https://vercel.com/account/tokens (project write scope)
 * - VERCEL_PROJECT_ID: project → settings → general → Project ID
 * - VERCEL_TEAM_ID (optional): team → settings → general → Team ID
 *
 * Also honors VERCEL_TOKEN / VERCEL_ORG_ID (the Vercel CLI's env var names).
 *
 * Writes each key as type=encrypted; will **overwrite** if a var with the
 * same target scope already exists. Run with --dry-run first to preview.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const KEYS_TO_MIRROR = [
  'STRIPE_SECRET_KEY',
  'STRIPE_RESTRICTED_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_ENDPOINT_ID',
  'CRON_SECRET',
] as const;

type VercelEnvTarget = 'production' | 'preview' | 'development';

async function main() {
  const token = process.env.VERCEL_API_TOKEN ?? process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID ?? process.env.VERCEL_ORG_ID;

  if (!token || !projectId) {
    console.error(
      'Missing VERCEL_API_TOKEN and/or VERCEL_PROJECT_ID. See the header comment.',
    );
    process.exit(1);
  }

  const envsArg = process.argv.find((a) => a.startsWith('--envs='))?.split('=')[1];
  const targets: VercelEnvTarget[] = envsArg
    ? (envsArg.split(',').map((s) => s.trim()) as VercelEnvTarget[])
    : ['production', 'preview'];
  const dryRun = process.argv.includes('--dry-run');

  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const baseUrl = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${query}`;

  const envLocal = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const kv = parseDotenv(envLocal);

  const missing = KEYS_TO_MIRROR.filter((k) => !kv[k]);
  if (missing.length > 0) {
    console.warn(`[vercel-env-mirror] skipping (not in .env.local): ${missing.join(', ')}`);
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of KEYS_TO_MIRROR) {
    const value = kv[key];
    if (!value) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would upsert ${key} → ${targets.join(',')}`);
      ok += 1;
      continue;
    }

    try {
      // 1) Check if it already exists.
      const listRes = await fetch(`${baseUrl}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!listRes.ok) {
        throw new Error(`list env failed: ${listRes.status} ${await listRes.text()}`);
      }
      const list = (await listRes.json()) as {
        envs: Array<{ id: string; key: string; target: string[] }>;
      };
      const existing = list.envs.find(
        (e) =>
          e.key === key &&
          targets.every((t) => e.target.includes(t)),
      );

      if (existing) {
        // Update in place.
        const upRes = await fetch(
          `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env/${existing.id}${query}`,
          {
            method: 'PATCH',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ value, target: targets }),
          },
        );
        if (!upRes.ok) throw new Error(`update failed: ${upRes.status} ${await upRes.text()}`);
        console.log(`✓ updated ${key} on ${targets.join(',')}`);
      } else {
        // Create new.
        const createRes = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ key, value, type: 'encrypted', target: targets }),
        });
        if (!createRes.ok) throw new Error(`create failed: ${createRes.status} ${await createRes.text()}`);
        console.log(`+ created ${key} on ${targets.join(',')}`);
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`✗ ${key}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(2);
}

function parseDotenv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
