export function InvoiceStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    draft: { label: 'Draft', classes: 'bg-white/5 text-text-muted' },
    open: { label: 'Open', classes: 'bg-amber-500/10 text-amber-300' },
    paid: { label: 'Paid', classes: 'bg-emerald-500/10 text-emerald-300' },
    uncollectible: { label: 'Uncollectible', classes: 'bg-coral-500/10 text-coral-300' },
    void: { label: 'Void', classes: 'bg-white/5 text-text-muted' },
  };
  const s = map[status] ?? { label: status, classes: 'bg-white/5 text-text-muted' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.classes}`}>
      {s.label}
    </span>
  );
}

export function SubscriptionStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    active: { label: 'Active', classes: 'bg-emerald-500/10 text-emerald-300' },
    trialing: { label: 'Trialing', classes: 'bg-nz-cyan/10 text-nz-cyan' },
    past_due: { label: 'Past due', classes: 'bg-amber-500/10 text-amber-300' },
    canceled: { label: 'Canceled', classes: 'bg-white/5 text-text-muted' },
    incomplete: { label: 'Incomplete', classes: 'bg-white/5 text-text-muted' },
    unpaid: { label: 'Unpaid', classes: 'bg-coral-500/10 text-coral-300' },
    paused: { label: 'Paused', classes: 'bg-white/5 text-text-muted' },
  };
  const s = map[status] ?? { label: status, classes: 'bg-white/5 text-text-muted' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.classes}`}>
      {s.label}
    </span>
  );
}

export function LifecycleStatePill({ state }: { state: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    lead: { label: 'Lead', classes: 'bg-white/5 text-text-muted' },
    contracted: { label: 'Contracted', classes: 'bg-nz-cyan/10 text-nz-cyan' },
    paid_deposit: { label: 'Deposit paid', classes: 'bg-nz-purple/15 text-nz-purple-100' },
    active: { label: 'Active', classes: 'bg-emerald-500/10 text-emerald-300' },
    churned: { label: 'Churned', classes: 'bg-coral-500/10 text-coral-300' },
  };
  const s = map[state] ?? { label: state, classes: 'bg-white/5 text-text-muted' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.classes}`}>
      {s.label}
    </span>
  );
}
