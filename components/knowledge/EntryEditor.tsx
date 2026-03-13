'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { KnowledgeEntry } from '@/lib/knowledge/types';

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
  meeting_note: '#2dd4bf',
};

type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface EntryEditorProps {
  entry: KnowledgeEntry;
  allEntries: KnowledgeEntry[];
  clientId: string;
  onEntryUpdated: (updated: KnowledgeEntry) => void;
}

export function EntryEditor({ entry, allEntries, clientId, onEntryUpdated }: EntryEditorProps) {
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wikilinkStartRef = useRef<number>(-1);

  // Reset state when entry changes
  useEffect(() => {
    setTitle(entry.title);
    setContent(entry.content);
    setSaveStatus('saved');
    setShowAutocomplete(false);
  }, [entry.id, entry.title, entry.content]);

  // Auto-save
  const save = useCallback(
    async (newTitle: string, newContent: string) => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/clients/${clientId}/knowledge/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle, content: newContent }),
        });
        if (!res.ok) {
          const d = await res.json();
          toast.error(d.error ?? 'Failed to save');
          setSaveStatus('unsaved');
          return;
        }
        const updated = await res.json();
        setSaveStatus('saved');
        onEntryUpdated(updated);
      } catch {
        toast.error('Failed to save');
        setSaveStatus('unsaved');
      }
    },
    [clientId, entry.id, onEntryUpdated]
  );

  const debounceSave = useCallback(
    (newTitle: string, newContent: string) => {
      setSaveStatus('unsaved');
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => save(newTitle, newContent), 1500);
    },
    [save]
  );

  useEffect(() => {
    return () => clearTimeout(saveTimeoutRef.current);
  }, []);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    debounceSave(newTitle, content);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    debounceSave(title, newContent);
    checkForWikilink(newContent);
  };

  // Wikilink autocomplete
  const autocompleteEntries = useMemo(() => {
    if (!showAutocomplete) return [];
    const q = autocompleteQuery.toLowerCase();
    return allEntries
      .filter((e) => e.id !== entry.id && e.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [showAutocomplete, autocompleteQuery, allEntries, entry.id]);

  const checkForWikilink = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = text.slice(0, cursorPos);

    // Check for [[ without closing ]]
    const lastOpen = textBefore.lastIndexOf('[[');
    const lastClose = textBefore.lastIndexOf(']]');

    if (lastOpen > lastClose && lastOpen >= 0) {
      const query = textBefore.slice(lastOpen + 2);
      // Don't show if query contains newline
      if (query.includes('\n')) {
        setShowAutocomplete(false);
        return;
      }
      wikilinkStartRef.current = lastOpen;
      setAutocompleteQuery(query);
      setAutocompleteIndex(0);
      setShowAutocomplete(true);

      // Position the dropdown
      const lines = textBefore.split('\n');
      const lineIndex = lines.length - 1;
      const charIndex = lines[lineIndex].length;
      setAutocompletePosition({
        top: (lineIndex + 1) * 20 + 8,
        left: Math.min(charIndex * 7.2, 400),
      });
    } else {
      setShowAutocomplete(false);
    }
  };

  const insertWikilink = (selectedTitle: string) => {
    const start = wikilinkStartRef.current;
    if (start < 0) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const before = content.slice(0, start);
    const after = content.slice(textarea.selectionStart);
    const newContent = `${before}[[${selectedTitle}]]${after}`;
    setContent(newContent);
    debounceSave(title, newContent);
    setShowAutocomplete(false);

    // Set cursor after inserted wikilink
    requestAnimationFrame(() => {
      const newPos = start + selectedTitle.length + 4;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
      textarea.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete || autocompleteEntries.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocompleteIndex((i) => Math.min(i + 1, autocompleteEntries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocompleteIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      insertWikilink(autocompleteEntries[autocompleteIndex].title);
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  };

  // Backlinks: entries that reference this entry via [[title]]
  const backlinks = useMemo(() => {
    const pattern = `[[${entry.title}]]`;
    return allEntries.filter(
      (e) => e.id !== entry.id && e.content.includes(pattern)
    );
  }, [allEntries, entry.id, entry.title]);

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const color = TYPE_COLORS[entry.type] ?? '#64748b';

  const statusLabel = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved changes',
  }[saveStatus];

  const statusColor = {
    saved: 'text-emerald-400',
    saving: 'text-amber-400',
    unsaved: 'text-amber-400',
  }[saveStatus];

  return (
    <div className="flex-1 min-h-0">
      {/* Title */}
      <div className="px-6 pt-5 pb-2">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full bg-transparent text-lg font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
          placeholder="Entry title"
        />
      </div>

      {/* Metadata bar */}
      <div className="px-6 pb-3 flex items-center gap-3 flex-wrap">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: `${color}20`,
            color: color,
          }}
        >
          {entry.type.replace(/_/g, ' ')}
        </span>
        <span className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-[10px] font-medium text-text-muted">
          {entry.source}
        </span>
        <span className="text-[10px] text-text-muted">
          {new Date(entry.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span className="text-[10px] text-text-muted">{wordCount} words</span>
        <span className={`text-[10px] ${statusColor} ml-auto`}>{statusLabel}</span>
      </div>

      {/* Content editor */}
      <div className="px-6 pb-4 relative">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay to allow click on autocomplete
              setTimeout(() => setShowAutocomplete(false), 200);
            }}
            className="w-full min-h-[300px] bg-background rounded-lg border border-nativz-border p-4 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none leading-relaxed"
            placeholder="Start writing..."
            style={{ height: `${Math.max(300, content.split('\n').length * 20 + 40)}px` }}
          />

          {/* Wikilink autocomplete dropdown */}
          {showAutocomplete && autocompleteEntries.length > 0 && (
            <div
              className="absolute z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-nativz-border bg-surface shadow-elevated"
              style={{
                top: `${autocompletePosition.top}px`,
                left: `${autocompletePosition.left}px`,
              }}
            >
              {autocompleteEntries.map((e, i) => (
                <button
                  key={e.id}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    insertWikilink(e.title);
                  }}
                  className={`cursor-pointer w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                    i === autocompleteIndex
                      ? 'bg-accent-surface text-accent-text'
                      : 'text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[e.type] ?? '#64748b' }}
                  />
                  <span className="truncate">{e.title}</span>
                  <span className="text-[10px] text-text-muted ml-auto shrink-0">
                    {e.type.replace(/_/g, ' ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="mt-6 pt-4 border-t border-nativz-border">
            <h3 className="text-xs font-medium text-text-secondary mb-2">
              Linked from
            </h3>
            <div className="space-y-1">
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  className="cursor-pointer w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[bl.type] ?? '#64748b' }}
                  />
                  <span className="truncate">{bl.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
