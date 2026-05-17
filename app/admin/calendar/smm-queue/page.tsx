import { SmmQueueView } from '@/components/calendar/smm-queue-view';

export const dynamic = 'force-dynamic';

/**
 * SMM review queue. Lists drops grouped by handoff_state with the
 * DropListSmmFilter pill on top. Filter value is URL-controlled via
 * ?handoff=smm_review so deep links into a state survive refresh.
 */
export default async function SmmQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ handoff?: string }>;
}) {
  const { handoff } = await searchParams;
  return <SmmQueueView initialHandoff={handoff} />;
}
