'use client';

import { useState } from 'react';
import { TeamMember } from './pipeline-types';

interface PersonCellProps {
  value: string | null;
  field: string;
  itemId: string;
  teamMembers: TeamMember[];
  onUpdate: (id: string, field: string, value: string) => void;
}

export function PersonCell({ value, field, itemId, teamMembers, onUpdate }: PersonCellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-text-secondary hover:text-text-primary cursor-pointer truncate max-w-[100px] block"
        title={value ?? 'Unassigned'}
      >
        {value ?? <span className="text-text-muted">—</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl py-1 min-w-[160px] max-h-48 overflow-y-auto">
            <button
              onClick={() => { onUpdate(itemId, field, ''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover cursor-pointer"
            >
              Unassigned
            </button>
            {teamMembers.map(m => (
              <button
                key={m.id}
                onClick={() => { onUpdate(itemId, field, m.full_name); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer flex items-center gap-2"
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-surface-hover" />
                )}
                <span className="truncate">{m.full_name}</span>
                <span className="text-[10px] text-text-muted ml-auto">{m.role}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
