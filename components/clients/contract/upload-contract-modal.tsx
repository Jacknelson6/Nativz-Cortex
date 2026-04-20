'use client';

import { useState } from 'react';
import { Upload, X, Plus } from 'lucide-react';
import { DeliverableRow, type DeliverableInput } from './deliverable-row';

interface UploadContractModalProps {
  slug: string;
  serviceSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

type Phase = 'idle' | 'uploading' | 'review' | 'saving';

export function UploadContractModal({ slug, serviceSuggestions, onClose, onSaved }: UploadContractModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'active' | 'ended'>('active');
  const [effectiveStart, setEffectiveStart] = useState<string>('');
  const [effectiveEnd, setEffectiveEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [deliverables, setDeliverables] = useState<DeliverableInput[]>([]);

  async function handleFile(file: File) {
    setPhase('uploading');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/clients/${slug}/contracts`, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Upload failed');
      setContractId(body.contract_id);
      setLabel(body.draft.suggested_label ?? 'Contract');
      setEffectiveStart(body.draft.effective_start ?? '');
      setEffectiveEnd(body.draft.effective_end ?? '');
      setDeliverables(body.draft.deliverables ?? []);
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    }
  }

  async function handleSave() {
    if (!contractId) return;
    setPhase('saving');
    setError(null);
    try {
      const res = await fetch(`/api/clients/${slug}/contracts/${contractId}/confirm`, {
        method: 'POST',
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
      setPhase('review');
    }
  }

  async function handleCancel() {
    if (contractId && phase === 'review') {
      await fetch(`/api/clients/${slug}/contracts/${contractId}`, { method: 'DELETE' });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Upload contract</h2>
          <button onClick={handleCancel} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}

          {phase === 'idle' && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl py-12 cursor-pointer hover:bg-surface-hover">
              <Upload size={28} className="text-text-muted mb-2" />
              <span className="text-sm text-text-secondary">PDF, DOCX, TXT — up to 20 MB</span>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          {phase === 'uploading' && (
            <div className="py-12 text-center text-sm text-text-secondary">
              Uploading and extracting deliverables...
            </div>
          )}

          {(phase === 'review' || phase === 'saving') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-text-secondary">
                  Label
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  />
                </label>
                <label className="text-sm text-text-secondary">
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'ended')}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
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
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  />
                </label>
                <label className="text-sm text-text-secondary">
                  Effective end
                  <input
                    type="date"
                    value={effectiveEnd}
                    onChange={(e) => setEffectiveEnd(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  />
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Deliverables</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverables([
                        ...deliverables,
                        { service_tag: '', name: '', quantity_per_month: 1 },
                      ])
                    }
                    className="text-xs text-accent-text flex items-center gap-1"
                  >
                    <Plus size={12} /> Add row
                  </button>
                </div>
                <div className="space-y-2">
                  {deliverables.length === 0 && (
                    <div className="text-sm text-text-muted py-4 text-center">
                      No deliverables detected — click &ldquo;Add row&rdquo; to enter manually.
                    </div>
                  )}
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
                  className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                />
              </label>
            </>
          )}
        </div>

        {(phase === 'review' || phase === 'saving') && (
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
              disabled={phase === 'saving'}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={phase === 'saving' || !label.trim()}
              className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50"
            >
              {phase === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
