'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DeliverableRow, type DeliverableInput } from './deliverable-row';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface EditContractModalProps {
  slug: string;
  contractId: string;
  initial: {
    label: string;
    status: 'draft' | 'active' | 'ended';
    effective_start: string | null;
    effective_end: string | null;
    notes: string | null;
    deliverables: DeliverableInput[];
  };
  serviceSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditContractModal({
  slug,
  contractId,
  initial,
  serviceSuggestions,
  onClose,
  onSaved,
}: EditContractModalProps) {
  const [label, setLabel] = useState(initial.label);
  const [status, setStatus] = useState<'active' | 'ended'>(
    initial.status === 'draft' ? 'active' : initial.status,
  );
  const [effectiveStart, setEffectiveStart] = useState(initial.effective_start ?? '');
  const [effectiveEnd, setEffectiveEnd] = useState(initial.effective_end ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [deliverables, setDeliverables] = useState<DeliverableInput[]>(initial.deliverables);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${slug}/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          status,
          effective_start: effectiveStart || null,
          effective_end: effectiveEnd || null,
          notes: notes || null,
          deliverables,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Edit contract" maxWidth="2xl">
      <div className="space-y-4">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-text-secondary">
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-nativz-border rounded-md text-text-primary"
            />
          </label>
          <label className="text-sm text-text-secondary">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'ended')}
              className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-nativz-border rounded-md text-text-primary"
            >
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </select>
          </label>
          <label className="text-sm text-text-secondary">
            Effective start
            <input
              type="date"
              value={effectiveStart}
              onChange={(e) => setEffectiveStart(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-nativz-border rounded-md text-text-primary"
            />
          </label>
          <label className="text-sm text-text-secondary">
            Effective end
            <input
              type="date"
              value={effectiveEnd}
              onChange={(e) => setEffectiveEnd(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-nativz-border rounded-md text-text-primary"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text-primary">Deliverables</h3>
            <button
              type="button"
              onClick={() =>
                setDeliverables([
                  ...deliverables,
                  { service_tag: '', name: '', quantity_per_month: 1 },
                ])
              }
              className="text-xs text-accent-text flex items-center gap-1 cursor-pointer hover:underline"
            >
              <Plus size={12} /> Add row
            </button>
          </div>
          <div className="space-y-2">
            {deliverables.map((d, i) => (
              <DeliverableRow
                key={i}
                value={d}
                serviceSuggestions={serviceSuggestions}
                onChange={(next) => {
                  const copy = [...deliverables];
                  copy[i] = next;
                  setDeliverables(copy);
                }}
                onRemove={() => setDeliverables(deliverables.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </div>

        <label className="text-sm text-text-secondary block">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-nativz-border rounded-md text-text-primary"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-nativz-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !label.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
