import { createAdminClient } from '@/lib/supabase/admin';
import { SchedulerContent } from '@/components/scheduler/scheduler-content';
import type { ClientOption } from '@/components/scheduler/types';
import { getActiveBrand } from '@/lib/active-brand';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const supabase = createAdminClient();

  // The calendar dropdown should mirror the top-bar brand pill — every active
  // client is reachable, regardless of whether SMM is one of their services.
  // The previous `services @> ['SMM']` filter silently hid recently
  // onboarded brands (services left empty) and brands whose engagement is
  // editing/paid-only, which is why the dropdown showed a different client
  // than the pill.
  const [{ data: clientRows }, active] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, slug, default_posting_time, default_posting_timezone')
      .eq('is_active', true)
      .order('name'),
    getActiveBrand(),
  ]);

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

  return <SchedulerContent initialClients={clients} initialClientId={initialClientId} />;
}
