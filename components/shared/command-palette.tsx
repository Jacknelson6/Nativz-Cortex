'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Image, Camera, Users, Search, BarChart3, Sparkles,
  Settings, ArrowRight, Clock, ChevronRight, Plus, Loader2, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string;
}

interface ParsedTask {
  title: string;
  client_name?: string;
  due_date?: string;
  priority?: string;
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
  const [mode, setMode] = useState<'navigate' | 'task'>('navigate');
  const [parsedTask, setParsedTask] = useState<ParsedTask | null>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const navigate = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  const resetTaskState = useCallback(() => {
    setMode('navigate');
    setParsedTask(null);
    setParsing(false);
    setConfirming(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const enterTaskMode = useCallback(() => {
    setMode('task');
    setQuery('');
    setParsedTask(null);
    setParsing(false);
    setConfirming(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const navItems: CommandItem[] = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', group: 'Navigation', icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate('/admin/dashboard'), keywords: 'home overview' },
    { id: 'ideas', label: 'Ideas', group: 'Navigation', icon: <Sparkles className="w-4 h-4" />, action: () => navigate('/admin/ideas'), keywords: 'generate scripts moodboard inspiration' },
    { id: 'shoots', label: 'Shoots', group: 'Navigation', icon: <Camera className="w-4 h-4" />, action: () => navigate('/admin/shoots'), keywords: 'photo video production' },
    { id: 'clients', label: 'Clients', group: 'Navigation', icon: <Users className="w-4 h-4" />, action: () => navigate('/admin/clients'), keywords: 'accounts brands' },
    { id: 'search', label: 'Search', group: 'Navigation', icon: <Search className="w-4 h-4" />, action: () => navigate('/admin/search/new'), keywords: 'topic social listening' },
    { id: 'search-history', label: 'Search History', group: 'Navigation', icon: <Clock className="w-4 h-4" />, action: () => navigate('/admin/search/history'), keywords: 'past searches' },
    { id: 'analytics', label: 'Analytics', group: 'Navigation', icon: <BarChart3 className="w-4 h-4" />, action: () => navigate('/admin/analytics'), keywords: 'metrics reports data' },
    { id: 'settings', label: 'Settings', group: 'Navigation', icon: <Settings className="w-4 h-4" />, action: () => navigate('/admin/settings'), keywords: 'preferences config' },
    { id: 'add-task', label: 'Add task', group: 'Quick actions', icon: <Plus className="w-4 h-4" />, action: () => enterTaskMode(), keywords: 'create todo new task' },
  ], [navigate, enterTaskMode]);

  const filtered = useMemo(() => {
    if (!query) return navItems;
    return navItems.filter(item =>
      fuzzyMatch(query, item.label) ||
      fuzzyMatch(query, item.keywords || '') ||
      fuzzyMatch(query, item.group)
    );
  }, [query, navItems]);

  // Build the display list: nav results + optional quick-task suggestion
  const displayItems = useMemo(() => {
    if (mode === 'task') return [];
    if (!query) return filtered;

    const hasNavMatches = filtered.length > 0;
    const trimmed = query.trim();

    // If there are no nav matches and the user typed something, offer to create a task
    if (!hasNavMatches && trimmed.length > 0) {
      const quickTaskItem: CommandItem = {
        id: 'quick-create-task',
        label: `Create task: ${trimmed}`,
        group: 'Quick actions',
        icon: <Plus className="w-4 h-4" />,
        action: () => {
          enterTaskMode();
          // Pre-fill the task input with what was typed
          setTimeout(() => {
            setQuery(trimmed);
          }, 60);
        },
        keywords: '',
      };
      return [quickTaskItem];
    }

    return filtered;
  }, [filtered, query, mode, enterTaskMode]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of displayItems) {
      (groups[item.group] ??= []).push(item);
    }
    return groups;
  }, [displayItems]);

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
      resetTaskState();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, resetTaskState]);

  useEffect(() => {
    if (mode === 'navigate') {
      setSelectedIndex(0);
    }
  }, [query, mode]);

  // Reset parsed task when query changes in task mode
  useEffect(() => {
    if (mode === 'task') {
      setParsedTask(null);
      setConfirming(false);
    }
  }, [query, mode]);

  const parseTaskText = useCallback(async (text: string) => {
    setParsing(true);
    try {
      const res = await fetch('/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Failed to parse task');
      const data = await res.json();
      setParsedTask(data);
      setConfirming(true);
    } catch {
      toast.error('Failed to parse task');
    } finally {
      setParsing(false);
    }
  }, []);

  const createTask = useCallback(async () => {
    if (!parsedTask) return;
    setConfirming(false);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedTask),
      });
      if (!res.ok) throw new Error('Failed to create task');
      toast.success('Task created');
      setOpen(false);
    } catch {
      toast.error('Failed to create task');
    }
  }, [parsedTask]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'task') {
      if (e.key === 'Escape') {
        e.preventDefault();
        resetTaskState();
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (confirming && parsedTask) {
          createTask();
        } else if (!parsing && query.trim()) {
          parseTaskText(query.trim());
        }
        return;
      }
      return;
    }

    // Navigate mode
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, displayItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && displayItems[selectedIndex]) {
      e.preventDefault();
      displayItems[selectedIndex].action();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          {mode === 'task' ? (
            <Plus className="w-4 h-4 text-blue-400" />
          ) : (
            <Search className="w-4 h-4 text-zinc-400" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'task'
                ? 'Add a task... (e.g. Edit Rana videos by Friday)'
                : 'Search pages, clients, actions...'
            }
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {parsing && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Parsed task chips */}
        {mode === 'task' && parsedTask && (
          <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-white/10">
            {parsedTask.title && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                {parsedTask.title}
              </span>
            )}
            {parsedTask.client_name && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                {parsedTask.client_name}
              </span>
            )}
            {parsedTask.due_date && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                {parsedTask.due_date}
              </span>
            )}
            {parsedTask.priority && (
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                {parsedTask.priority}
              </span>
            )}
          </div>
        )}

        {/* Results list (navigate mode) */}
        {mode === 'navigate' && (
          <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
            {displayItems.length === 0 ? (
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
        )}

        {/* Task mode body */}
        {mode === 'task' && !parsedTask && !parsing && (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            Type a task and press Enter to parse it
          </div>
        )}
        {mode === 'task' && parsing && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Parsing task...
          </div>
        )}

        {/* Footer hint */}
        {mode === 'task' && confirming && parsedTask && (
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-white/10 text-xs text-zinc-400">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            Press Enter to create task
          </div>
        )}
      </div>
    </div>
  );
}
