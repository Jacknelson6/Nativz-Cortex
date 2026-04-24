import type { Detector } from '../types';

/**
 * Clients in lifecycle_state='active' but never paid a single invoice.
 * Usually means someone manually bumped the state or a contract.signed event
 * fired without a matching payment.
 */
export const lifecycleInconsistencyDetector: Detector = {
  id: 'lifecycle_inconsistency',
  severity: 'warning',
  label: 'Active client with no paid invoices',
  rationale:
    'lifecycle_state=\'active\' means "we\'re working for them + they\'re paying." Zero paid invoices contradicts that. Usually a manual state change or a sign event without a paid deposit.',
  async detect(admin) {
    const { data: activeClients } = await admin
      .from('clients')
      .select('id, name')
      .eq('lifecycle_state', 'active');
    if (!activeClients) return [];

    const findings: Awaited<ReturnType<Detector['detect']>> = [];
    for (const c of activeClients) {
      const { count } = await admin
        .from('stripe_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', c.id)
        .eq('status', 'paid');
      if ((count ?? 0) === 0) {
        findings.push({
          entity_type: 'client',
          entity_id: c.id,
          client_id: c.id,
          title: `${c.name}: 'active' with zero paid invoices`,
          description:
            'Either lifecycle_state was set manually or the deposit never paid. Check lifecycle events.',
        });
      }
    }
    return findings;
  },
};
