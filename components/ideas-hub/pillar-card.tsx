'use client';

import { useState } from 'react';
import { Pencil, RefreshCw, Trash2, Check, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface Pillar {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  example_series: string[];
  formats: string[];
  hooks: string[];
  frequency: string | null;
  sort_order: number;
  direction?: string;
}

interface PillarCardProps {
  pillar: Pillar;
  clientId: string;
  onUpdate: (updated: Pillar) => void;
  onDelete: (id: string) => void;
  index: number;
}

export function PillarCard({ pillar, clientId, onUpdate, onDelete, index }: PillarCardProps) {
  const [editing, setEditing] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [editName, setEditName] = useState(pillar.name);
  const [editDescription, setEditDescription] = useState(pillar.description ?? '');

  const handleSaveEdit = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/pillars/${pillar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update pillar');
      const data = await res.json();
      onUpdate(data.pillar ?? { ...pillar, name: editName.trim(), description: editDescription.trim() || null });
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleReroll = async () => {
    setRerolling(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/pillars/${pillar.id}/reroll`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to re-roll pillar');
      const data = await res.json();
      onUpdate(data.pillar ?? pillar);
      toast.success('Pillar re-rolled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to re-roll');
    } finally {
      setRerolling(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/pillars/${pillar.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete pillar');
      onDelete(pillar.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div
      className="group relative rounded-xl border border-nativz-border bg-surface border-l-2 border-l-purple-500/30 transition-all hover:border-l-purple-500/60 animate-stagger-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Re-roll overlay */}
      {rerolling && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/80 backdrop-blur-sm">
          <Loader2 size={20} className="animate-spin text-accent2-text" />
        </div>
      )}

      <div className="p-4">
        {editing ? (
          /* Edit mode */
          <div className="space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
              placeholder="Pillar name"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors resize-none"
              placeholder="Description (optional)"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent2 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Check size={12} />
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditName(pillar.name);
                  setEditDescription(pillar.description ?? '');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <X size={12} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Display mode */
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-primary">
                  {pillar.emoji && <span className="mr-1.5">{pillar.emoji}</span>}
                  {pillar.name}
                </h3>
                {pillar.description && (
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                    {pillar.description}
                  </p>
                )}
              </div>

              {/* Action buttons — visible on hover */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => {
                    setEditName(pillar.name);
                    setEditDescription(pillar.description ?? '');
                    setEditing(true);
                  }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={handleReroll}
                  disabled={rerolling}
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent2-text hover:bg-accent2-surface transition-colors cursor-pointer disabled:opacity-40"
                  title="Re-roll"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Direction input */}
            <div className="mt-3">
              <input
                type="text"
                value={pillar.direction ?? ''}
                onChange={(e) => onUpdate({ ...pillar, direction: e.target.value })}
                placeholder="Direction for this pillar (optional)…"
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/40 focus:outline-none focus-visible:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
              />
            </div>

            {/* Tags */}
            {(pillar.formats.length > 0 || pillar.frequency) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {pillar.formats.map((format) => (
                  <Badge key={format} variant="purple">
                    {format}
                  </Badge>
                ))}
                {pillar.frequency && (
                  <Badge variant="default">{pillar.frequency}</Badge>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
