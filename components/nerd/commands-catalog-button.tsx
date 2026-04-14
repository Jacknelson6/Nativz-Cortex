'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Command, Zap, X } from 'lucide-react';
import { getAllCommands } from '@/lib/nerd/slash-commands';

/**
 * Button that reveals the full catalog of available slash commands. Mirrors
 * Claude Code's "/" menu: lets the user browse what they can do before they
 * start typing. Includes a link to the Settings > Skills page so uploaded
 * skills (future) show up here alongside the built-in commands.
 */
export function CommandsCatalogButton() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commands = getAllCommands();

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Available commands"
        title="Available commands"
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-nativz-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent/20 hover:text-text-primary ${
          open ? 'border-accent/30 text-text-primary' : ''
        }`}
      >
        <Command size={12} />
        Commands
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden animate-[popIn_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
        >
          <div className="flex items-center justify-between border-b border-nativz-border/60 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Available commands</h3>
              <p className="mt-0.5 text-[11px] text-text-muted">
                Type <span className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[10px] text-text-secondary">/</span> in the composer to jump to one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {commands.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-text-muted">
                No commands registered.
              </p>
            ) : (
              <ul className="py-1">
                {commands.map((cmd) => (
                  <li key={cmd.name}>
                    <div className="flex items-start gap-2.5 px-4 py-2">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.04]">
                        {cmd.type === 'direct' ? (
                          <Command size={12} className="text-accent-text" />
                        ) : (
                          <Zap size={12} className="text-accent2-text" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-medium text-text-primary">
                          /{cmd.name}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                          {cmd.description}
                        </p>
                        {cmd.example && (
                          <p className="mt-1 font-mono text-[10px] text-text-muted/80">
                            {cmd.example}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-nativz-border/60 px-4 py-2.5 bg-background/40">
            <Link
              href="/admin/settings/skills"
              onClick={() => setOpen(false)}
              className="block text-[11px] text-text-muted hover:text-accent-text transition-colors"
            >
              Manage skills → install custom commands for the Nerd
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
