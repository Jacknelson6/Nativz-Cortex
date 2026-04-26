/**
 * Diagnose why freebusy is missing events for a teammate.
 *
 * For each authorized teammate:
 *   1. List every calendar they can see (calendarList.list).
 *   2. Run freebusy across ALL of them (not just primary) for the next 7 days.
 *   3. Compare to a `events.list` count on each calendar.
 *
 * Run: npx tsx scripts/debug-calendar-coverage.ts <email>
 */

import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';

dotenv({ path: resolve(process.cwd(), '.env.local') });

interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  selected?: boolean;
  accessRole: string;
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx scripts/debug-calendar-coverage.ts <email>');
    process.exit(1);
  }

  const { getServiceAccountCalendarToken } = await import('../lib/google/service-account');
  const token = await getServiceAccountCalendarToken(email);

  const headers = { Authorization: `Bearer ${token}` };

  const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers,
  });
  if (!calRes.ok) {
    console.error(`calendarList ${calRes.status}: ${await calRes.text()}`);
    process.exit(1);
  }
  const calJson = (await calRes.json()) as { items?: CalendarListEntry[] };
  const calendars = calJson.items ?? [];

  console.log(`\n${email} — ${calendars.length} calendars visible:\n`);
  for (const c of calendars) {
    const flags = [c.primary ? 'primary' : '', c.selected ? 'selected' : '', c.accessRole]
      .filter(Boolean)
      .join(' · ');
    console.log(`  ${c.summary.padEnd(45)} (${flags})`);
    console.log(`    ${c.id}`);
  }

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: now.toISOString(),
      timeMax: weekOut.toISOString(),
      items: calendars.map((c) => ({ id: c.id })),
    }),
  });
  if (!fbRes.ok) {
    console.error(`freeBusy ${fbRes.status}: ${await fbRes.text()}`);
    process.exit(1);
  }
  const fbJson = (await fbRes.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }>;
  };

  console.log(`\nfreeBusy across all visible calendars (next 7d):\n`);
  let totalBusy = 0;
  for (const c of calendars) {
    const entry = fbJson.calendars?.[c.id];
    const busy = entry?.busy ?? [];
    const errors = entry?.errors ?? [];
    totalBusy += busy.length;
    if (errors.length) {
      console.log(`  ${c.summary.padEnd(45)} ERRORS: ${errors.map((e) => e.reason).join(', ')}`);
      continue;
    }
    console.log(`  ${c.summary.padEnd(45)} ${String(busy.length).padStart(3)} busy`);
  }
  console.log(`\n  Total busy windows across all calendars: ${totalBusy}`);

  // Sanity: also pull raw events.list on each owned calendar to count events
  // (including those marked transparent/Free which freeBusy ignores).
  console.log(`\nRaw events.list count per calendar (next 7d, including 'Free' events):\n`);
  for (const c of calendars) {
    if (!['owner', 'writer'].includes(c.accessRole)) continue;
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events`,
    );
    url.searchParams.set('timeMin', now.toISOString());
    url.searchParams.set('timeMax', weekOut.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('maxResults', '250');
    const r = await fetch(url, { headers });
    if (!r.ok) {
      console.log(`  ${c.summary.padEnd(45)} events.list ${r.status}`);
      continue;
    }
    const j = (await r.json()) as {
      items?: {
        transparency?: string;
        status?: string;
        summary?: string;
        eventType?: string;
        visibility?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        organizer?: { email?: string; self?: boolean };
      }[];
    };
    const items = j.items ?? [];
    const busy = items.filter((e) => e.transparency !== 'transparent' && e.status !== 'cancelled');
    const transparent = items.filter((e) => e.transparency === 'transparent');
    console.log(
      `\n  ${c.summary} — ${items.length} total · ${busy.length} busy · ${transparent.length} 'free':`,
    );
    for (const ev of items) {
      const when = ev.start?.dateTime ?? ev.start?.date ?? '?';
      const allDay = !!ev.start?.date && !ev.start?.dateTime;
      const flags = [
        ev.eventType && ev.eventType !== 'default' ? `type=${ev.eventType}` : '',
        ev.transparency === 'transparent' ? 'free' : '',
        ev.visibility ?? '',
        allDay ? 'all-day' : '',
        ev.status === 'cancelled' ? 'cancelled' : '',
        ev.organizer?.self === false ? `org=${ev.organizer?.email ?? '?'}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `    ${when.slice(0, 16).padEnd(17)} ${(ev.summary ?? '(no title)').slice(0, 50).padEnd(52)} [${flags}]`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
