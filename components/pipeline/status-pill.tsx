'use client';

import { useState } from 'react';
import { StatusConfig } from './pipeline-types';

function getStatusConfig(statuses: StatusConfig[], value: string): StatusConfig {
  return statuses.find(s => s.value === value) ?? statuses[0];
}

interface StatusPillProps {
  value: string;
  statuses: StatusConfig[];
  field: string;
  itemId: string;
  onUpdate: (id: string, field: string, value: string) => void;
}

export function StatusPill({ value, statuses, field, itemId, onUpdate }: StatusPillProps) {
  const [open, setOpen] = useState(false);
  const config = getStatusConfig(statuses, value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border cursor-pointer transition-colors whitespace-nowrap ${config.color}`}
      >
        {config.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl py-1 min-w-[160px]">
            {statuses.map(s => (
              <button
                key={s.value}
                onClick={() => { onUpdate(itemId, field, s.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer hover:bg-surface-hover ${
                  s.value === value ? 'text-text-primary font-medium' : 'text-text-muted'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.color.split(' ')[0]}`} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
