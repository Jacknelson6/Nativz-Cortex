// ZNA-01 T13: CLI wrapper around POST /api/admin/analytics/backfill.
//
// Usage:
//   pnpm tsx scripts/backfill-platform-snapshots.ts --client=<uuid> --days=30
//   pnpm tsx scripts/backfill-platform-snapshots.ts --client=<uuid> --days=90 --platforms=tiktok,instagram
//
// Required env:
//   - NEXT_PUBLIC_SITE_URL (defaults to http://localhost:3001)
//   - BACKFILL_ADMIN_COOKIE (full Cookie header value from an admin session)
//
// The route enforces admin auth; this CLI just passes through the session
// cookie. For long ranges (> 50 runs) the API returns a "queue not yet
// implemented" stub and exits non-zero so CI scripts can detect.

type Flags = Record<string, string>;

function parseArgs(argv: string[]): Flags {
  const out: Flags = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    out[key] = value ?? 'true';
  }
  return out;
}

async function main() {
  const flags = parseArgs(process.argv);
  const clientId = flags.client;
  const days = flags.days ? Number(flags.days) : 30;
  const platforms = flags.platforms ? flags.platforms.split(',') : undefined;
  const sourceOverride = flags.source as 'zernio' | 'scrape' | 'apify' | undefined;

  if (!clientId) {
    console.error('Missing --client=<uuid>');
    process.exit(2);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3001';
  const cookie = process.env.BACKFILL_ADMIN_COOKIE?.trim();
  if (!cookie) {
    console.error('Missing BACKFILL_ADMIN_COOKIE env. Copy a full Cookie header from a logged-in admin session.');
    process.exit(2);
  }

  const res = await fetch(`${baseUrl}/api/admin/analytics/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      client_id: clientId,
      days,
      ...(platforms ? { platforms } : {}),
      ...(sourceOverride ? { source_override: sourceOverride } : {}),
    }),
  });

  const body = await res.json().catch(() => ({ error: 'invalid json' }));
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
