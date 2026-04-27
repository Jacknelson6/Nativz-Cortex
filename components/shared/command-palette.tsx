'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, BarChart3, Search,
  Settings, ArrowRight, Clock, Mic2, Send,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const navigate = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  const navItems: CommandItem[] = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', group: 'Navigation', icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate('/admin/dashboard'), keywords: 'home overview' },
    { id: 'post-scheduler', label: 'Post scheduler', group: 'Navigation', icon: <Send className="w-4 h-4" />, action: () => navigate('/admin/scheduling'), keywords: 'late publish social posts scheduling smm' },
    { id: 'clients', label: 'Clients', group: 'Navigation', icon: <Users className="w-4 h-4" />, action: () => navigate('/admin/clients'), keywords: 'accounts brands' },
    { id: 'meetings', label: 'Meetings', group: 'Navigation', icon: <Mic2 className="w-4 h-4" />, action: () => navigate('/admin/meetings'), keywords: 'fyxer notes recurring adhoc prospects' },
    { id: 'research', label: 'Research', group: 'Navigation', icon: <Search className="w-4 h-4" />, action: () => navigate('/finder/new'), keywords: 'topic social listening ideas generate' },
    { id: 'research-history', label: 'Research history', group: 'Navigation', icon: <Clock className="w-4 h-4" />, action: () => navigate('/finder/new'), keywords: 'past searches' },
    { id: 'analytics', label: 'Analytics', group: 'Navigation', icon: <BarChart3 className="w-4 h-4" />, action: () => navigate('/admin/analytics'), keywords: 'metrics reports data' },
    { id: 'settings', label: 'Settings', group: 'Navigation', icon: <Settings className="w-4 h-4" />, action: () => navigate('/admin/settings'), keywords: 'preferences config' },
  ], [navigate]);

  const filtered = useMemo(() => {
    if (!query) return navItems;
    return navItems.filter(item =>
      fuzzyMatch(query, item.label) ||
      fuzzyMatch(query, item.keywords || '') ||
      fuzzyMatch(query, item.group)
    );
  }, [query, navItems]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      (groups[item.group] ??= []).push(item);
    }
    return groups;
  }, [filtered]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-[color:var(--nz-ink)]/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-nativz-border bg-surface/95 backdrop-blur-xl shadow-[var(--shadow-elevated)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-nativz-border">
          <Search className="w-4 h-4 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, clients, actions..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">No results found</div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {group}
                </div>
                {items.map(item => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.action()}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        idx === selectedIndex
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="text-zinc-400">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-600" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
