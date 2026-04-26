/**
 * Smoke test for the new SA-driven calendar overlay.
 *
 * Hits the same code path /api/calendar/events does — loads scheduling_people
 * + their email aliases from Supabase, calls fetchEventsForPerson per person
 * via service-account / DWD, and prints the resulting overlay payload.
 *
 * Run: npx tsx scripts/test-calendar-overlay.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

import { fetchEventsForPerson } from '../lib/scheduling/google-events';

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [{ data: people }, { data: emails }] = await Promise.all([
    admin
      .from('scheduling_people')
      .select('id, display_name, color, priority_tier, is_active')
      .eq('is_active', true)
      .order('priority_tier', { ascending: true }),
    admin.from('scheduling_person_emails').select('person_id, email'),
  ]);

  if (!people || people.length === 0) {
    console.error('No active scheduling_people rows. Run migration 169 first.');
    process.exit(1);
  }

  const emailsByPerson = new Map<string, string[]>();
  for (const row of emails ?? []) {
    const list = emailsByPerson.get(row.person_id) ?? [];
    list.push(row.email);
    emailsByPerson.set(row.person_id, list);
  }

  // Window: today through end-of-week
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 7);

  console.log(`\nWindow: ${timeMin.toISOString()} → ${timeMax.toISOString()}\n`);
  console.log('=== Calendar overlay payload (what /api/calendar/events returns) ===\n');

  for (const p of people) {
    const personEmails = emailsByPerson.get(p.id) ?? [];
    const tier = p.priority_tier;
    const tierLabel = tier === 1 ? 'T1 Required' : tier === 2 ? 'T2 Preferred' : 'T3 Optional';

    process.stdout.write(`[${tierLabel}] ${p.display_name} (${p.color})\n`);
    process.stdout.write(`  emails: ${personEmails.join(', ')}\n`);

    if (personEmails.length === 0) {
      process.stdout.write('  ⚠️  no emails configured — skipped\n\n');
      continue;
    }

    const result = await fetchEventsForPerson({
      personId: p.id,
      emails: personEmails,
      timeMin,
      timeMax,
    });

    process.stdout.write(`  events: ${result.events.length}\n`);
    for (const ev of result.events.slice(0, 6)) {
      const localStart = new Date(ev.start).toLocaleString('en-US', {
        weekday: 'short',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      process.stdout.write(`    • ${localStart} — ${ev.title}\n`);
    }
    if (result.events.length > 6) {
      process.stdout.write(`    … (+${result.events.length - 6} more)\n`);
    }
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        process.stdout.write(`  ⚠️  ${e.email}: ${e.error}\n`);
      }
    }
    process.stdout.write('\n');
  }

  console.log('=== Done ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
