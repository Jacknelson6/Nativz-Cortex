import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, Clock } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ContentDrop } from '@/lib/types/calendar';

export const dynamic = 'force-dynamic';

const VIEWER_VISIBLE_STATUSES: ContentDrop['status'][] = ['ready', 'scheduled'];

export default async function ViewerCalendarPage() {
  const active = await getActiveBrand().catch(() => null);
  if (active?.isAdmin) redirect('/admin/calendar');

  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Pick a brand from the top bar to see its drops.</p>
        </div>
      </div>
    );
  }

  // Defence in depth: even though the brand pill resolves via user_client_access,
  // re-verify that the current user actually has access to this client before
  // returning anything. Cookie tampering can't widen scope this way.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: access } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', user.id)
    .eq('client_id', active.brand.id)
    .maybeSingle();
  if (!access) redirect('/');

  const { data: drops } = await admin
    .from('content_drops')
    .select('id, start_date, end_date, default_post_time, total_videos, processed_videos, status, created_at')
    .eq('client_id', active.brand.id)
    .in('status', VIEWER_VISIBLE_STATUSES)
    .order('start_date', { ascending: false });

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Posts scheduled for {active.brand.name}.
        </p>
      </header>

      {(drops ?? []).length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No drops to review yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Once your team finishes captioning a batch, it&rsquo;ll show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(drops ?? []).map((d) => (
            <DropCard key={d.id} drop={d as ContentDrop} />
          ))}
        </div>
      )}
    </div>
  );
}

function DropCard({ drop }: { drop: ContentDrop }) {
  return (
    <Link
      href={`/calendar/${drop.id}`}
      className="block rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {drop.start_date} → {drop.end_date}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {drop.processed_videos}/{drop.total_videos} posts · default {drop.default_post_time}
          </p>
        </div>
        <StatusBadge status={drop.status} />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: ContentDrop['status'] }) {
  const tone =
    status === 'scheduled'
      ? 'bg-emerald-500/10 text-emerald-300'
      : 'bg-amber-500/10 text-amber-300';
  const label = status === 'scheduled' ? 'Scheduled' : 'In review';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      <Clock size={10} />
      {label}
    </span>
  );
}
