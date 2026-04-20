'use client';

import { Trash2 } from 'lucide-react';
import type { z } from 'zod';
import { deliverableSchema } from '@/lib/contracts/types';

export type DeliverableInput = z.infer<typeof deliverableSchema>;

export function DeliverableRow({
  value,
  serviceSuggestions,
  onChange,
  onRemove,
}: {
  value: DeliverableInput;
  serviceSuggestions: string[];
  onChange: (next: DeliverableInput) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr_90px_40px] gap-2 items-start">
      <input
        list="service-tags"
        value={value.service_tag}
        onChange={(e) => onChange({ ...value, service_tag: e.target.value })}
        placeholder="Service tag"
        className="px-2 py-1.5 text-sm bg-surface-hover border border-border rounded-md"
      />
      <input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Deliverable name"
        className="px-2 py-1.5 text-sm bg-surface-hover border border-border rounded-md"
      />
      <input
        type="number"
        min={0}
        value={value.quantity_per_month}
        onChange={(e) => onChange({ ...value, quantity_per_month: Number(e.target.value) || 0 })}
        className="px-2 py-1.5 text-sm bg-surface-hover border border-border rounded-md text-right"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-text-muted hover:text-destructive"
        aria-label="Remove deliverable"
      >
        <Trash2 size={14} />
      </button>
      <datalist id="service-tags">
        {serviceSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
