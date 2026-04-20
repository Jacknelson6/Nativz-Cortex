'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, MoreVertical, Plus } from 'lucide-react';
import { UploadContractModal } from './upload-contract-modal';
import { EditContractModal } from './edit-contract-modal';
import type { DeliverableInput } from './deliverable-row';

interface ContractRow {
  id: string;
  label: string;
  status: 'draft' | 'active' | 'ended';
  effective_start: string | null;
  effective_end: string | null;
  file_name: string | null;
  uploaded_at: string;
  notes: string | null;
}

interface DeliverableRowData {
  id: string;
  contract_id: string;
  service_tag: string;
  name: string;
  quantity_per_month: number;
  notes: string | null;
  sort_order: number;
}

interface ContractWorkspaceProps {
  slug: string;
  clientName: string;
  services: string[];
  initialContracts: ContractRow[];
  initialDeliverables: DeliverableRowData[];
}

export function ContractWorkspace({
  slug,
  clientName,
  services,
  initialContracts,
  initialDeliverables,
}: ContractWorkspaceProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);

  const activeContracts = initialContracts.filter((c) => c.status === 'active');
  const pastContracts = initialContracts.filter((c) => c.status !== 'active');

  const activeDeliverables = useMemo(() => {
    const activeIds = new Set(activeContracts.map((c) => c.id));
    return initialDeliverables.filter((d) => activeIds.has(d.contract_id));
  }, [activeContracts, initialDeliverables]);

  const groupedByTag = useMemo(() => {
    const groups = new Map<string, DeliverableRowData[]>();
    for (const d of activeDeliverables) {
      const list = groups.get(d.service_tag) ?? [];
      list.push(d);
      groups.set(d.service_tag, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeDeliverables]);

  function refresh() {
    setUploadOpen(false);
    setEditing(null);
    router.refresh();
  }

  async function handleDownload(contractId: string) {
    const res = await fetch(`/api/clients/${slug}/contracts/${contractId}/signed-url`);
    const body = await res.json();
    if (res.ok && body.url) window.open(body.url, '_blank', 'noopener');
  }

  async function handleDelete(contractId: string) {
    if (!confirm('Delete this contract? Deliverables will be removed and services recomputed.')) return;
    await fetch(`/api/clients/${slug}/contracts/${contractId}`, { method: 'DELETE' });
    router.refresh();
  }

  function deliverablesForContract(id: string): DeliverableInput[] {
    return initialDeliverables
      .filter((d) => d.contract_id === id)
      .map((d) => ({
        service_tag: d.service_tag,
        name: d.name,
        quantity_per_month: d.quantity_per_month,
        notes: d.notes ?? undefined,
      }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contract</h1>
          <p className="text-sm text-text-muted mt-1">Deliverables and contract history for {clientName}</p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md flex items-center gap-1.5"
        >
          <Plus size={14} /> Upload contract
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium mb-3">Active services</h2>
        {services.length === 0 ? (
          <p className="text-sm text-text-muted">No active services — upload a contract to populate.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <span key={s} className="px-2.5 py-1 text-xs bg-accent/10 text-accent-text rounded-full">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium mb-3">Monthly deliverables</h2>
        {groupedByTag.length === 0 ? (
          <p className="text-sm text-text-muted">No deliverables yet.</p>
        ) : (
          <div className="space-y-4">
            {groupedByTag.map(([tag, rows]) => {
              const total = rows.reduce((sum, r) => sum + r.quantity_per_month, 0);
              return (
                <div key={tag}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <h3 className="text-sm font-medium">{tag}</h3>
                    <span className="text-xs text-text-muted">{total}/mo total</span>
                  </div>
                  <ul className="space-y-1">
                    {rows.map((r) => (
                      <li key={r.id} className="flex justify-between text-sm">
                        <span className="text-text-secondary">{r.name}</span>
                        <span className="text-text-muted">{r.quantity_per_month}/mo</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ContractsList
        title="Active contracts"
        rows={activeContracts}
        onEdit={setEditing}
        onDownload={handleDownload}
        onDelete={handleDelete}
        emptyText="No active contracts."
      />

      {pastContracts.length > 0 && (
        <ContractsList
          title="Past contracts"
          rows={pastContracts}
          onEdit={setEditing}
          onDownload={handleDownload}
          onDelete={handleDelete}
          emptyText="None yet."
          collapsed
        />
      )}

      {uploadOpen && (
        <UploadContractModal
          slug={slug}
          serviceSuggestions={services}
          onClose={() => setUploadOpen(false)}
          onSaved={refresh}
        />
      )}
      {editing && (
        <EditContractModal
          slug={slug}
          contractId={editing.id}
          initial={{
            label: editing.label,
            status: editing.status,
            effective_start: editing.effective_start,
            effective_end: editing.effective_end,
            notes: editing.notes,
            deliverables: deliverablesForContract(editing.id),
          }}
          serviceSuggestions={services}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function ContractsList({
  title,
  rows,
  emptyText,
  collapsed = false,
  onEdit,
  onDownload,
  onDelete,
}: {
  title: string;
  rows: ContractRow[];
  emptyText: string;
  collapsed?: boolean;
  onEdit: (c: ContractRow) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="bg-surface border border-border rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-xs text-text-muted">{rows.length}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-2">
          {rows.length === 0 && <p className="text-sm text-text-muted">{emptyText}</p>}
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-hover"
            >
              <div className="flex items-center gap-3">
                <FileText size={15} className="text-text-muted" />
                <div>
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-xs text-text-muted">
                    {c.file_name ?? 'No file'} · {c.effective_start ?? '—'} to {c.effective_end ?? 'ongoing'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDownload(c.id)}
                  className="p-1.5 text-text-muted hover:text-text-primary"
                  aria-label="Download"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => onEdit(c)}
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="p-1.5 text-text-muted hover:text-destructive"
                  aria-label="Delete"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
