import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { SchedulePicker } from './picker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public team-availability picker. Anyone with the share_token can view the
 * event, see the overlap-free slots, and book one (cal.diy-style).
 *
 * The page itself is a thin server shell — slots are fetched client-side from
 * /api/schedule/[token] so we don't pay for a freebusy roundtrip on every
 * cold render. The picker also handles the "already booked" empty state
 * coming back from the API.
 */
export default async function SchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('team_scheduling_events')
    .select('id, name, status')
    .eq('share_token', token)
    .maybeSingle();

  if (!event) notFound();

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <SchedulePicker token={token} initialName={event.name} initialStatus={event.status} />
      </div>
    </div>
  );
}
