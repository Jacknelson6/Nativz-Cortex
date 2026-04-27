import { createAdminClient } from '@/lib/supabase/admin';
import { SchedulerContent } from '@/components/scheduler/scheduler-content';
import type { ClientOption } from '@/components/scheduler/types';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const supabase = createAdminClient();

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, slug, default_posting_time, default_posting_timezone')
    .eq('is_active', true)
    .contains('services', ['SMM'])
    .order('name');

  const clients: ClientOption[] = (clientRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    default_posting_time: (c.default_posting_time as string) ?? null,
    default_posting_timezone: (c.default_posting_timezone as string) ?? null,
  }));

  return <SchedulerContent initialClients={clients} />;
}
