'use client';

// VFF-06 T10: Pending proposal card on /admin/formats/taxonomy proposals tab.
// Renders kind badge, slug, evidence thumb, and three actions
// (approve / merge / reject). Merge opens an inline picker that
// suggests existing slugs from the same kind.

import { useMemo, useState } from 'react';
import type { TaxonomyProposal, TaxonomyRow } from '@/lib/analytics/types';

type Props = {
  proposal: TaxonomyProposal;
  evidenceThumbUrl?: string | null;
  sameKindFormats: TaxonomyRow[];
  onApprove: (id: string, retag: boolean) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onMerge: (id: string, targetFormatId: string) => Promise<void>;
};

const KIND_TINT: Record<TaxonomyProposal['kind'], string> = {
  hook_type: 'bg-fuchsia-950/40 text-fuchsia-200',
  structure: 'bg-sky-950/40 text-sky-200',
  archetype: 'bg-emerald-950/40 text-emerald-200',
  pacing: 'bg-amber-950/40 text-amber-200',
};

export function ProposalCard({
  proposal,
  evidenceThumbUrl,
  sameKindFormats,
  onApprove,
  onReject,
  onMerge,
}: Props) {
  const [busy, setBusy] = useState<'approve' | 'reject' | 'merge' | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [retag, setRetag] = useState(true);

  const filteredTargets = useMemo(() => {
    const q = mergeQuery.trim().toLowerCase();
    if (!q) return sameKindFormats.slice(0, 8);
    return sameKindFormats
      .filter(
        (f) =>
          f.slug.toLowerCase().includes(q) ||
          f.display_name.toLowerCase().includes(q) ||
          f.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [mergeQuery, sameKindFormats]);

  const run = async (
    fn: () => Promise<void>,
    label: 'approve' | 'reject' | 'merge',
  ) => {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <header className="flex items-start gap-3">
        <span
          className={`shrink-0 rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider ${KIND_TINT[proposal.kind]}`}
        >
          {proposal.kind.replace('_', ' ')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h4 className="truncate text-sm font-medium text-white/90">
              {proposal.display_name}
            </h4>
            <span className="shrink-0 text-[11px] text-white/40">
              ×{proposal.proposal_count}
            </span>
          </div>
          <div className="truncate font-mono text-[11px] text-white/40">
            {proposal.slug}
          </div>
        </div>
        {evidenceThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={evidenceThumbUrl}
            alt=""
            className="h-12 w-9 shrink-0 rounded object-cover"
            loading="lazy"
          />
        ) : null}
      </header>
      {proposal.proposed_description ? (
        <p className="text-[12px] text-white/60">{proposal.proposed_description}</p>
      ) : null}
      <footer className="flex flex-wrap items-center gap-2">
        <label className="mr-auto flex items-center gap-1.5 text-[11px] text-white/50">
          <input
            type="checkbox"
            checked={retag}
            onChange={(e) => setRetag(e.target.checked)}
            className="accent-accent"
          />
          retag existing
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(() => onApprove(proposal.id, retag), 'approve')}
          className="rounded-md border border-emerald-700/40 px-3 py-1 text-[11px] text-emerald-200 transition hover:border-emerald-500 disabled:opacity-40"
        >
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setMergeOpen((v) => !v)}
          className="rounded-md border border-white/10 px-3 py-1 text-[11px] text-white/80 transition hover:border-accent disabled:opacity-40"
        >
          Merge…
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(() => onReject(proposal.id), 'reject')}
          className="rounded-md border border-rose-700/40 px-3 py-1 text-[11px] text-rose-200 transition hover:border-rose-500 disabled:opacity-40"
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </footer>
      {mergeOpen ? (
        <div className="mt-1 rounded-lg border border-white/10 bg-black/30 p-3">
          <input
            type="text"
            value={mergeQuery}
            onChange={(e) => setMergeQuery(e.target.value)}
            placeholder="Search existing slug or alias…"
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-accent focus:outline-none"
          />
          <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-white/5">
            {filteredTargets.length === 0 ? (
              <li className="py-2 text-center text-[11px] text-white/40">
                No matches in {proposal.kind}
              </li>
            ) : (
              filteredTargets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(() => onMerge(proposal.id, t.id), 'merge')}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                  >
                    <span className="truncate">{t.display_name}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-white/40">
                      {t.slug}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
