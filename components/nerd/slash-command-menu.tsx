'use client';

import { useEffect, useRef } from 'react';
import { Command, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

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
  /**
   * Keyboard-navigation active item index. Controlled by the parent so
   * Arrow/Enter handling on the input stays in one place. When omitted the
   * menu highlights nothing (click-only mode).
   */
  activeIndex?: number;
}

/**
 * Filter the command list by query the same way the menu does, so parents
 * tracking `activeIndex` for keyboard nav stay in sync with what's rendered.
 * Always use this helper — do not reimplement the filter elsewhere.
 */
export function filterSlashCommands(
  query: string,
  commands: SlashCommandOption[],
): SlashCommandOption[] {
  const q = query.toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(q));
}

export function SlashCommandMenu({
  query,
  commands,
  onSelect,
  activeIndex,
}: SlashCommandMenuProps) {
  const filtered = filterSlashCommands(query, commands);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the active item in view when the parent moves the selection with
  // Arrow keys and the list has overflowed.
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-nativz-border/50">
        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Commands</p>
      </div>
      <div className="max-h-[240px] overflow-y-auto py-1">
        {filtered.map((cmd, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={cmd.name}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelect(cmd)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-left transition-colors cursor-pointer',
                isActive ? 'bg-accent-surface/30' : 'hover:bg-surface-hover',
              )}
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
          );
        })}
      </div>
    </div>
  );
}
