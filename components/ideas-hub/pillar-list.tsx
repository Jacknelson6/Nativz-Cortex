'use client';

import { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { PillarCard } from './pillar-card';
import type { Pillar } from './pillar-card';

interface PillarListProps {
  pillars: Pillar[];
  clientId: string;
  onPillarsChange: (pillars: Pillar[]) => void;
}

export function PillarList({ pillars, clientId, onPillarsChange }: PillarListProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleUpdate = async (updated: Pillar) => {
    onPillarsChange(pillars.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/clients/${clientId}/pillars/${id}`, { method: 'DELETE' });
      onPillarsChange(pillars.filter((p) => p.id !== id));
    } catch {
      toast.error('Failed to delete pillar');
    }
  };

  const handleAddManual = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/pillars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          sort_order: pillars.length,
        }),
      });
      if (!res.ok) throw new Error('Failed to add pillar');
      const data = await res.json();
      const newPillar: Pillar = data.pillar ?? {
        id: data.id ?? crypto.randomUUID(),
        name: newName.trim(),
        description: newDescription.trim() || null,
        emoji: null,
        example_series: [],
        formats: [],
        hooks: [],
        frequency: null,
        sort_order: pillars.length,
      };
      onPillarsChange([...pillars, newPillar]);
      setNewName('');
      setNewDescription('');
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add pillar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {pillars.map((pillar, i) => (
        <PillarCard
          key={pillar.id}
          pillar={pillar}
          clientId={clientId}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          index={i}
        />
      ))}

      {/* Add manually */}
      {adding ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
            placeholder="Pillar name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim() && !saving) {
                e.preventDefault();
                handleAddManual();
              }
            }}
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
            placeholder="Description (optional)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim() && !saving) {
                e.preventDefault();
                handleAddManual();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddManual}
              disabled={!newName.trim() || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent2 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
            >
              <Check size={12} />
              Add pillar
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName('');
                setNewDescription('');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-nativz-border/60 bg-transparent px-4 py-3.5 text-xs text-text-muted hover:border-accent2/40 hover:text-accent2-text transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Add pillar manually
        </button>
      )}
    </div>
  );
}
