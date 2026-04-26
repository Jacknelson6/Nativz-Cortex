'use client';

import { useEffect, useState } from 'react';

export interface UnifiedSlashCommand {
  name: string;
  description: string;
  type: 'direct' | 'ai';
  example: string | null;
  source: 'builtin' | 'skill';
  /** Only populated for skill-sourced commands. */
  skillContent?: string;
  /** Optional Mustache-ish template ("{args}", "{content}") — skill only. */
  promptTemplate?: string | null;
}

/**
 * Fetches the unified slash command list (built-ins + user-installed skills).
 * Cached in a module-level ref so opening the slash menu again uses the
 * cached result instead of re-fetching. Bust the cache by calling
 * `invalidateSlashCommandsCache()` (exported below) — the /admin/nerd/settings
 * page does this after a skill edit.
 */
let cachedCommands: UnifiedSlashCommand[] | null = null;
let inflightRequest: Promise<UnifiedSlashCommand[]> | null = null;
const listeners = new Set<() => void>();

export function invalidateSlashCommandsCache() {
  cachedCommands = null;
  inflightRequest = null;
  listeners.forEach((l) => l());
}

async function loadCommands(): Promise<UnifiedSlashCommand[]> {
  if (cachedCommands) return cachedCommands;
  if (inflightRequest) return inflightRequest;
  inflightRequest = (async () => {
    try {
      const res = await fetch('/api/nerd/slash-commands', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const list = (data.commands ?? []) as UnifiedSlashCommand[];
      cachedCommands = list;
      return list;
    } catch {
      return [];
    } finally {
      inflightRequest = null;
    }
  })();
  return inflightRequest;
}

export function useSlashCommands(): { commands: UnifiedSlashCommand[]; loading: boolean } {
  const [commands, setCommands] = useState<UnifiedSlashCommand[]>(cachedCommands ?? []);
  const [loading, setLoading] = useState<boolean>(cachedCommands === null);

  useEffect(() => {
    let cancelled = false;
    async function runSync() {
      setLoading(true);
      try {
        const list = await loadCommands();
        if (!cancelled) setCommands(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    const sync = () => {
      void runSync();
    };
    sync();
    listeners.add(sync);
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, []);

  return { commands, loading };
}

/**
 * Expand a skill-sourced slash command into the text we'll send to the Nerd.
 * Substitutes {args} and {content} tokens in the stored prompt_template.
 * Falls back to a sensible default template when the skill has no template.
 */
export function expandSkillCommand(cmd: UnifiedSlashCommand, args: string): string {
  if (cmd.source !== 'skill') return args;
  const content = cmd.skillContent ?? '';
  const template =
    cmd.promptTemplate && cmd.promptTemplate.trim().length > 0
      ? cmd.promptTemplate
      : 'Using the skill below, help me with: {args}\n\n---\n\n{content}';
  return template.replace(/\{args\}/g, args.trim()).replace(/\{content\}/g, content);
}
