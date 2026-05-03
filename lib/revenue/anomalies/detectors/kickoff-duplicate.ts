import type { Detector } from '../types';

/**
 * Detect clients who received the kickoff_invitation email more than once.
 * The kickoff-once guard (migration 160 + `clients.kickoff_email_sent_at`)
 * prevents this going forward, but historical bad sends are still in
 * `email_messages`. We count all `typeKey='onboarding'` sends grouped by
 * client_id, since `sendOnboardingEmail` (the kickoff transport) tags every
 * row with `typeKey='onboarding'` and the per-client kickoff is one-shot.
 */
export const kickoffDuplicateDetector: Detector = {
  id: 'kickoff_duplicate',
  severity: 'error',
  label: 'Duplicate kickoff email sent',
  rationale:
    'A client received the "welcome, let\'s schedule kickoff" email more than once. This is confusing to the client and suggests a bug in the onboarding trigger. Investigate email_messages.',
  async detect(admin) {
    const { data } = await admin
      .from('email_messages')
      .select('client_id, clients(id, name)')
      .eq('type_key', 'onboarding')
      .eq('status', 'sent')
      .not('client_id', 'is', null);
    if (!data) return [];

    const buckets = new Map<string, { clientId: string; clientName: string; count: number }>();
    for (const row of data) {
      const clientId = row.client_id as string | null;
      const client = row.clients as { name?: string | null } | null;
      if (!clientId) continue;
      const existing = buckets.get(clientId);
      if (existing) existing.count += 1;
      else buckets.set(clientId, { clientId, clientName: client?.name ?? 'Unknown', count: 1 });
    }

    return Array.from(buckets.values())
      .filter((b) => b.count > 1)
      .map((b) => ({
        entity_type: 'client',
        entity_id: b.clientId,
        client_id: b.clientId,
        title: `${b.clientName} received kickoff email ${b.count}× `,
        description: `email_messages has ${b.count} onboarding-typed sends for this client.`,
      }));
  },
};
