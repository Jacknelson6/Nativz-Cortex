'use client';

import { Command, Zap } from 'lucide-react';

interface SlashCommandOption {
  name: string;
  description: string;
  type: 'direct' | 'ai';
  example?: string;
}

interface SlashCommandMenuProps {
  query: string;
  commands: SlashCommandOption[];
  onSelect: (command: SlashCommandOption) => void;
}

export function SlashCommandMenu({ query, commands, onSelect }: SlashCommandMenuProps) {
  const filtered = commands.filter((c) =>
    c.name.toLowerCase().startsWith(query.toLowerCase()),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-nativz-border/50">
        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Commands</p>
      </div>
      <div className="max-h-[240px] overflow-y-auto py-1">
        {filtered.map((cmd) => (
          <button
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] shrink-0">
              {cmd.type === 'direct' ? (
                <Command size={13} className="text-accent-text" />
              ) : (
                <Zap size={13} className="text-accent2-text" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">/{cmd.name}</span>
                <span className="text-[10px] text-text-muted/50">
                  {cmd.type === 'direct' ? 'instant' : 'AI'}
                </span>
              </div>
              <p className="text-xs text-text-muted truncate">{cmd.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
