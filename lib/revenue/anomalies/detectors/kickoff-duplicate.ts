import type { Detector } from '../types';

/**
 * Detect clients who received the kickoff_invitation email more than once.
 * This is the exact bug the kickoff-once guard (migration 160) prevents going
 * forward — the detector flags any historical bad sends so admins can reach
 * out and apologize.
 */
export const kickoffDuplicateDetector: Detector = {
  id: 'kickoff_duplicate',
  severity: 'error',
  label: 'Duplicate kickoff email sent',
  rationale:
    'A client received the "welcome, let\'s schedule kickoff" email more than once. This is confusing to the client and suggests a bug in the onboarding trigger. Investigate onboarding_email_sends.',
  async detect(admin) {
    const { data } = await admin
      .from('onboarding_email_sends')
      .select('tracker_id, template_id, onboarding_trackers(client_id, clients(id, name))')
      .eq('status', 'sent');
    if (!data) return [];

    // Group by (client_id, template_id) and flag any bucket with >1.
    const buckets = new Map<string, { clientId: string; clientName: string; count: number }>();
    for (const row of data) {
      const tracker = row.onboarding_trackers as {
        client_id?: string | null;
        clients?: { id?: string; name?: string | null } | null;
      } | null;
      const clientId = tracker?.client_id;
      const clientName = tracker?.clients?.name ?? 'Unknown';
      if (!clientId) continue;
      const key = `${clientId}::${row.template_id}`;
      const existing = buckets.get(key);
      if (existing) existing.count += 1;
      else buckets.set(key, { clientId, clientName, count: 1 });
    }

    return Array.from(buckets.values())
      .filter((b) => b.count > 1)
      .map((b) => ({
        entity_type: 'client',
        entity_id: b.clientId,
        client_id: b.clientId,
        title: `${b.clientName} received kickoff email ${b.count}× `,
        description: `onboarding_email_sends has ${b.count} rows for this client + the kickoff template.`,
      }));
  },
};
