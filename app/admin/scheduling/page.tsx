import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TeamAvailability } from '@/components/calendar/team-availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Team-availability scheduling — list of every event the team has spun up
 * for clients, scoped by a created_by + status filter. Click into an event
 * to see its share URL, members, and pick (when scheduled).
 *
 * The companion routes:
 *   - /admin/scheduling/new          — create a new event
 *   - /schedule/[token]              — public client picker
 *   - POST /api/scheduling/events    — admin create
 *   - GET  /api/schedule/[token]     — public freebusy + slots
 */

type EventRow = {
  id: string;
  name: string;
  duration_minutes: number;
  status: 'open' | 'scheduled' | 'canceled' | 'expired';
  share_token: string;
  client_id: string | null;
  created_at: string;
};

type ClientLite = { id: string; name: string };

export default async function SchedulingListPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/admin/scheduling');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = me?.role === 'admin' || me?.is_super_admin === true;
  if (!isAdmin) redirect('/');

  const { data: events } = await admin
    .from('team_scheduling_events')
    .select('id, name, duration_minutes, status, share_token, client_id, created_at')
    .order('created_at', { ascending: false })
    .limit(60);

  const eventList = (events ?? []) as EventRow[];

  const clientIds = Array.from(
    new Set(eventList.map((e) => e.client_id).filter((id): id is string => !!id)),
  );
  const clientById = new Map<string, ClientLite>();
  if (clientIds.length > 0) {
    const { data: clientRows } = await admin
      .from('clients')
      .select('id, name')
      .in('id', clientIds);
    for (const c of clientRows ?? []) clientById.set(c.id, c as ClientLite);
  }

  return (
    <div className="cortex-page-gutter space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="ui-page-title-md">Team scheduling</h1>
          <p className="text-sm text-text-muted">
            Spin up a cal.com-style picker for any group of teammates. Clients pick a slot when
            everyone&apos;s free.
          </p>
        </div>
        <Link
          href="/admin/scheduling/new"
          className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nz-btn-radius)] bg-accent px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-all duration-[var(--duration-fast)] ease-out hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98]"
        >
          <Plus size={14} />
          New event
        </Link>
      </header>

      <TeamAvailability />

      <div>
        {eventList.length === 0 ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
            <p className="text-sm font-medium text-text-primary">No events yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
              Spin up a picker, share the link, and the client books a slot when everyone&apos;s free.
            </p>
            <Link
              href="/admin/scheduling/new"
              className="mt-4 inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nz-btn-radius)] bg-accent px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-all duration-[var(--duration-fast)] ease-out hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98]"
            >
              <Plus size={14} />
              New event
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {eventList.map((e) => {
              const client = e.client_id ? clientById.get(e.client_id) : null;
              return (
                <li key={e.id} className="rounded-md border border-nativz-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-text-muted">
                        {client?.name ?? 'Ad-hoc'}
                      </p>
                      <p className="text-sm font-medium text-text-primary truncate">{e.name}</p>
                      <p className="text-[11px] text-text-muted">
                        {e.duration_minutes} min · {e.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/schedule/${e.share_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-nativz-border px-3 py-1.5 text-xs text-text-primary transition hover:bg-surface-hover"
                      >
                        <Calendar size={12} />
                        Picker URL
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
