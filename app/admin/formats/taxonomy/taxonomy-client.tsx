'use client';

// VFF-06 T11 (client island): tab switch + 4 columns + proposals
// queue + approve/reject/merge mutations.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxonomyRow, TaxonomyProposal, ViralFormatKind } from '@/lib/analytics/types';
import { TaxonomyColumn } from '@/components/formats/taxonomy-column';
import { ProposalCard } from '@/components/formats/proposal-card';

type Props = {
  formats: TaxonomyRow[];
  proposals: TaxonomyProposal[];
  evidenceMap: Record<string, string | null>;
  isSuper: boolean;
};

const KINDS: Array<{ kind: ViralFormatKind; title: string }> = [
  { kind: 'hook_type', title: 'Hook type' },
  { kind: 'structure', title: 'Structure' },
  { kind: 'archetype', title: 'Archetype' },
  { kind: 'pacing', title: 'Pacing' },
];

export function TaxonomyClient({ formats, proposals, evidenceMap, isSuper }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'taxonomy' | 'proposals'>('taxonomy');

  const byKind = useMemo(() => {
    const m = new Map<ViralFormatKind, TaxonomyRow[]>();
    for (const kind of KINDS) m.set(kind.kind, []);
    for (const f of formats) m.get(f.kind)?.push(f);
    return m;
  }, [formats]);

  const handleArchiveToggle = async (row: TaxonomyRow) => {
    const res = await fetch(`/api/admin/formats/taxonomy/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archived: row.archived_at === null }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Update failed');
      return;
    }
    router.refresh();
  };

  const handleApprove = async (id: string, retag: boolean) => {
    const res = await fetch(`/api/admin/formats/taxonomy/proposals/${id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ retag_existing: retag }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Approve failed');
      return;
    }
    router.refresh();
  };

  const handleReject = async (id: string) => {
    const res = await fetch(`/api/admin/formats/taxonomy/proposals/${id}/reject`, {
      method: 'POST',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Reject failed');
      return;
    }
    router.refresh();
  };

  const handleMerge = async (id: string, targetFormatId: string) => {
    const res = await fetch(`/api/admin/formats/taxonomy/proposals/${id}/merge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target_format_id: targetFormatId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Merge failed');
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 rounded-lg border border-white/5 bg-surface p-1 text-sm w-fit">
        <TabButton active={tab === 'taxonomy'} onClick={() => setTab('taxonomy')}>
          Taxonomy ({formats.length})
        </TabButton>
        <TabButton active={tab === 'proposals'} onClick={() => setTab('proposals')}>
          Proposals ({proposals.length})
        </TabButton>
      </nav>

      {tab === 'taxonomy' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KINDS.map(({ kind, title }) => (
            <TaxonomyColumn
              key={kind}
              kind={kind}
              title={title}
              rows={byKind.get(kind) ?? []}
              canEdit={isSuper}
              onArchiveToggle={handleArchiveToggle}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {proposals.length === 0 ? (
            <p className="col-span-full rounded-xl border border-white/5 bg-surface p-8 text-center text-sm text-white/40">
              No pending proposals
            </p>
          ) : (
            proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                evidenceThumbUrl={p.evidence_video_id ? evidenceMap[p.evidence_video_id] ?? null : null}
                sameKindFormats={(byKind.get(p.kind) ?? []).filter((f) => !f.archived_at)}
                onApprove={isSuper ? handleApprove : async () => alert('super_admin required')}
                onReject={isSuper ? handleReject : async () => alert('super_admin required')}
                onMerge={isSuper ? handleMerge : async () => alert('super_admin required')}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
