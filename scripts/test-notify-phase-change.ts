/**
 * End-to-end exercise of notifyPhaseChange against the live DB.
 *
 * 1. Loads .env.local (with quote-stripping).
 * 2. Picks a real editing_projects row.
 * 3. Calls notifyPhaseChange with a SYNTHETIC transition that does NOT
 *    mutate the project row (we don't touch editing_projects here; we
 *    just want to verify the webhook fan-out + activity_log mirror).
 * 4. Reads the freshly inserted activity_log row back and confirms the
 *    shape.
 *
 * The card lands in the Ops space (clearly marked as a test) and in the
 * client's own space if they have one. We use a low-traffic demo client
 * to keep the noise contained.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let value = trimmed.slice(eqIdx + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}

// Imports MUST come after env load because lib code reads env at import time
// in some places.
import { createAdminClient } from '../lib/supabase/admin';
import { notifyPhaseChange } from '../lib/content-projects/phase-webhook';

async function main() {
  const admin = createAdminClient();

  // Grab any editing_projects row joined with its client. We don't care
  // which one; we won't mutate it.
  const { data: project, error } = await admin
    .from('editing_projects')
    .select(
      `id, name, client_id,
       client:clients!editing_projects_client_id_fkey(name, chat_webhook_url)`,
    )
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[test-notify] failed to read editing_projects:', error);
    process.exit(1);
  }
  if (!project) {
    console.error('[test-notify] no editing_projects row found');
    process.exit(1);
  }

  const client = project.client as
    | { name?: string | null; chat_webhook_url?: string | null }
    | null;
  console.log(
    `[test-notify] using project ${project.id} (${project.name}) for client "${client?.name ?? '?'}" with chat_webhook_url=${client?.chat_webhook_url ? 'SET' : 'NULL'}`,
  );

  // Synthetic transition (no DB write to editing_projects).
  await notifyPhaseChange(admin, {
    projectId: project.id as string,
    projectName: `[TEST] ${project.name as string}`,
    clientId: project.client_id as string,
    clientName: client?.name ?? null,
    // Pass null for per-client to NOT spam the real client space.
    clientWebhookUrl: null,
    fromPhase: 'Editing',
    toPhase: 'Client review',
    actorId: null,
    actorName: 'test-notify-phase-change.ts',
    origin: 'https://cortex.nativz.io',
    extra: { Synthetic: 'true', Source: 'scripts/test-notify-phase-change.ts' },
  });

  // Allow the fire-and-forget webhook a moment to settle (we await the
  // log insert inside notifyPhaseChange but the chat post is detached).
  await new Promise((r) => setTimeout(r, 1500));

  // Pull the latest activity_log row tagged with this project_id and
  // confirm the shape.
  const { data: log, error: logErr } = await admin
    .from('activity_log')
    .select('id, action, entity_type, entity_id, metadata, created_at')
    .eq('action', 'content_project_phase_changed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (logErr) {
    console.error('[test-notify] activity_log read failed:', logErr);
    process.exit(1);
  }
  if (!log) {
    console.error('[test-notify] no activity_log row found - mirror DID NOT WRITE');
    process.exit(1);
  }
  console.log('[test-notify] activity_log row:');
  console.log(`  id          = ${log.id}`);
  console.log(`  action      = ${log.action}`);
  console.log(`  entity_type = ${log.entity_type}`);
  console.log(`  entity_id   = ${log.entity_id}`);
  console.log(`  metadata    = ${JSON.stringify(log.metadata)}`);
  console.log(`  created_at  = ${log.created_at}`);

  // Cleanup: remove the test row so we don't pollute the Notifications feed.
  await admin.from('activity_log').delete().eq('id', log.id);
  console.log(`[test-notify] cleaned up activity_log row ${log.id}`);

  // Sanity check on what we wrote.
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const expected = {
    project_id: project.id,
    from_phase: 'Editing',
    to_phase: 'Client review',
  };
  let ok = true;
  for (const [k, v] of Object.entries(expected)) {
    if (meta[k] !== v) {
      console.error(`[test-notify] metadata.${k} mismatch: got ${meta[k]}, want ${v}`);
      ok = false;
    }
  }
  if (log.entity_type !== 'client') {
    console.error(`[test-notify] entity_type mismatch: got ${log.entity_type}, want "client"`);
    ok = false;
  }
  if (!ok) process.exit(1);
  console.log('[test-notify] all assertions passed');
}

main().catch((err) => {
  console.error('[test-notify] threw:', err);
  process.exit(1);
});
