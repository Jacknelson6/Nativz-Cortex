'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  Globe,
  Users,
  StickyNote,
  File,
  Lightbulb,
  ChevronRight,
  FolderOpen,
  ListTodo,
} from 'lucide-react';
import type { KnowledgeEntry, KnowledgeLink } from '@/lib/knowledge/types';

const TYPE_COLORS: Record<string, string> = {
  brand_profile: '#f59e0b',
  web_page: '#38bdf8',
  note: '#a78bfa',
  document: '#a78bfa',
  idea: '#f472b6',
  idea_submission: '#f472b6',
  brand_asset: '#f59e0b',
  contact: '#fb923c',
  search: '#2dd4bf',
  strategy: '#f59e0b',
  meeting: '#2dd4bf',
  meeting_note: '#2dd4bf',
  decision: '#3b82f6',
  action_item: '#a855f7',
};

const OTHER_KEY = '__other__';

const TYPE_GROUPS = [
  { type: 'brand_profile', label: 'Brand profiles', Icon: FileText },
  { type: 'web_page', label: 'Web pages', Icon: Globe },
  { type: 'meeting', label: 'Meetings', Icon: Users },
  { type: 'meeting_note', label: 'Meetings (legacy)', Icon: Users },
  { type: 'decision', label: 'Decisions', Icon: FileText },
  { type: 'action_item', label: 'Action items', Icon: ListTodo },
  { type: 'note', label: 'Notes', Icon: StickyNote },
  { type: 'document', label: 'Documents', Icon: File },
  { type: 'idea', label: 'Ideas', Icon: Lightbulb },
] as const;

interface FileExplorerProps {
  entries: KnowledgeEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onContextMenu?: (entryId: string, x: number, y: number) => void;
  onHoverEntry?: (entryId: string | null) => void;
  searchQuery: string;
  links: KnowledgeLink[];
}

export function FileExplorer({
  entries,
  selectedEntryId,
  onSelectEntry,
  onContextMenu,
  onHoverEntry,
  searchQuery,
  links,
}: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => e.title.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, KnowledgeEntry[]> = {};
    for (const group of TYPE_GROUPS) {
      groups[group.type] = [];
    }
    groups[OTHER_KEY] = [];
    const known = new Set<string>(TYPE_GROUPS.map((g) => g.type));
    for (const entry of filteredEntries) {
      if (known.has(entry.type)) {
        groups[entry.type]!.push(entry);
      } else {
        groups[OTHER_KEY]!.push(entry);
      }
    }
    return groups;
  }, [filteredEntries]);

  const connectionCount = useMemo(() => {
    const uniquePairs = new Set(
      links.map((l) => [l.source_id, l.target_id].sort().join(':'))
    );
    return uniquePairs.size;
  }, [links]);

  const toggleCollapse = (type: string) => {
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  let itemIndex = 0;

  return (
    <div className="w-60 border-r border-nativz-border bg-background flex flex-col shrink-0 h-full">
      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {TYPE_GROUPS.map(({ type, label, Icon }) => {
          const items = groupedEntries[type] ?? [];
          if (items.length === 0 && searchQuery.trim()) return null;
          const isCollapsed = collapsed[type] ?? false;
          const color = TYPE_COLORS[type] ?? '#64748b';

          return (
            <div key={type}>
              {/* Folder header */}
              <button
                onClick={() => toggleCollapse(type)}
                className="cursor-pointer w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors group"
              >
                <ChevronRight
                  size={12}
                  className={`text-text-muted transition-transform duration-150 ${
                    !isCollapsed ? 'rotate-90' : ''
                  }`}
                />
                <Icon size={14} style={{ color }} className="shrink-0" />
                <span className="flex-1 text-left truncate">{label}</span>
                <span className="text-[10px] text-text-muted tabular-nums">
                  {items.length}
                </span>
              </button>

              {/* Entries */}
              {!isCollapsed && (
                <div>
                  {items.map((entry) => {
                    const idx = itemIndex++;
                    const isActive = selectedEntryId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        onClick={() => onSelectEntry(entry.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu?.(entry.id, e.clientX, e.clientY);
                        }}
                        onMouseEnter={() => onHoverEntry?.(entry.id)}
                        onMouseLeave={() => onHoverEntry?.(null)}
                        className={`cursor-pointer w-full flex items-center gap-2 pl-9 pr-3 py-1 text-xs transition-colors ${
                          isActive
                            ? 'bg-accent-surface/50 text-accent-text'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                        }`}
                        style={{
                          animation: 'fadeIn 0.3s ease-out both',
                          animationDelay: `${idx * 40}ms`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate text-left">
                          {entry.title.length > 30
                            ? entry.title.slice(0, 30) + '...'
                            : entry.title}
                        </span>
                      </button>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="pl-9 pr-3 py-1 text-[10px] text-text-muted italic">
                      No entries
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {(() => {
          const items = groupedEntries[OTHER_KEY] ?? [];
          if (items.length === 0 && searchQuery.trim()) return null;
          if (items.length === 0) return null;
          const isCollapsed = collapsed[OTHER_KEY] ?? false;
          const color = '#64748b';
          return (
            <div key={OTHER_KEY}>
              <button
                type="button"
                onClick={() => toggleCollapse(OTHER_KEY)}
                className="cursor-pointer w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors group"
              >
                <ChevronRight
                  size={12}
                  className={`text-text-muted transition-transform duration-150 ${
                    !isCollapsed ? 'rotate-90' : ''
                  }`}
                />
                <FolderOpen size={14} style={{ color }} className="shrink-0" />
                <span className="flex-1 text-left truncate">Other types</span>
                <span className="text-[10px] text-text-muted tabular-nums">{items.length}</span>
              </button>
              {!isCollapsed && (
                <div>
                  {items.map((entry) => {
                    const idx = itemIndex++;
                    const isActive = selectedEntryId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onSelectEntry(entry.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu?.(entry.id, e.clientX, e.clientY);
                        }}
                        onMouseEnter={() => onHoverEntry?.(entry.id)}
                        onMouseLeave={() => onHoverEntry?.(null)}
                        className={`cursor-pointer w-full flex items-center gap-2 pl-9 pr-3 py-1 text-xs transition-colors ${
                          isActive
                            ? 'bg-accent-surface/50 text-accent-text'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                        }`}
                        style={{
                          animation: 'fadeIn 0.3s ease-out both',
                          animationDelay: `${idx * 40}ms`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: TYPE_COLORS[entry.type] ?? color }}
                        />
                        <span className="truncate text-left">
                          <span className="text-text-muted mr-1">[{entry.type}]</span>
                          {entry.title.length > 26 ? entry.title.slice(0, 26) + '...' : entry.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Bottom summary */}
      <div className="px-3 py-2.5 border-t border-nativz-border">
        <p className="text-[10px] text-text-muted">
          {entries.length} entries, {connectionCount} connections
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-4px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
