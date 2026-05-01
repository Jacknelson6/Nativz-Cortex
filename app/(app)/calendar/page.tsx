import { redirect } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SchedulerContent } from '@/components/scheduler/scheduler-content';
import type { ClientOption } from '@/components/scheduler/types';

export const dynamic = 'force-dynamic';

/**
 * Unified content calendar page — same URL `/calendar` serves both admin
 * and viewer roles. The `SchedulerContent` shell branches on `mode`:
 *
 *   - admin  → full surface (autoschedule, new post, drive import,
 *              connect, share). Brand dropdown lists every active client.
 *   - viewer → read-leaning surface (browse, open posts, edit captions /
 *              tags / collaborators / scheduled times). Brand dropdown
 *              locks to the active brand from `user_client_access`.
 *
 * Brand-root pattern (matches /review, /brand-profile, /lab, /spying):
 * one URL, role-aware content. The legacy /admin/calendar route now
 * redirects here.
 */
export default async function CalendarPage() {
  const active = await getActiveBrand().catch(() => null);

  if (active?.isAdmin) {
    // Admin path: every active client is reachable from the dropdown,
    // regardless of services. Mirrors the top-bar brand pill.
    const adminSupabase = createAdminClient();
    const { data: clientRows } = await adminSupabase
      .from('clients')
      .select('id, name, slug, default_posting_time, default_posting_timezone')
      .eq('is_active', true)
      .order('name');

    const clients: ClientOption[] = (clientRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      default_posting_time: (c.default_posting_time as string) ?? null,
      default_posting_timezone: (c.default_posting_timezone as string) ?? null,
    }));

    const activeBrandId = active.brand?.id ?? null;
    const initialClientId = activeBrandId && clients.some((c) => c.id === activeBrandId)
      ? activeBrandId
      : clients[0]?.id ?? null;

    return (
      <SchedulerContent
        initialClients={clients}
        initialClientId={initialClientId}
        mode="admin"
      />
    );
  }

  // Viewer path: scope to the single active brand from
  // `user_client_access`. Empty-state if no brand is selected yet.
  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Your calendar</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Pick a brand from the top bar to see its content calendar.
          </p>
        </div>
      </div>
    );
  }

  // Defence in depth: even though the brand pill resolves via
  // user_client_access, re-verify that the current user actually has
  // access to this client before handing the SchedulerContent shell —
  // cookie tampering can't widen scope this way.
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

  // Viewer's brand pill picks one client at a time, so the dropdown is
  // single-option (matches the active brand).
  const { data: clientRow } = await admin
    .from('clients')
    .select('id, name, slug, default_posting_time, default_posting_timezone')
    .eq('id', active.brand.id)
    .maybeSingle();

  const clients: ClientOption[] = clientRow
    ? [
        {
          id: clientRow.id,
          name: clientRow.name,
          slug: clientRow.slug,
          default_posting_time: (clientRow.default_posting_time as string) ?? null,
          default_posting_timezone: (clientRow.default_posting_timezone as string) ?? null,
        },
      ]
    : [];

  return (
    <SchedulerContent
      initialClients={clients}
      initialClientId={active.brand.id}
      mode="viewer"
    />
  );
}
