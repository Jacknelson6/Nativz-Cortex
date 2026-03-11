'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Check, Flag, X, Inbox, User, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Task, TaskClient, TaskAssignee } from '@/components/tasks/types';
import { PRIORITY_OPTIONS } from './task-constants';
import { DateChip } from './date-picker-popover';
import { SelectTrigger } from './select-popover';
import { extractDateFromText, extractRecurrenceFromText } from './natural-date';
import type { RecurrenceRule } from './natural-date';

// ─── Highlight Overlay ────────────────────────────────────────────────────
// Renders colored backgrounds behind matched text ranges in the input.

interface HighlightRange {
  start: number;
  end: number;
  color: string;
}

function HighlightOverlays({
  inputRef,
  text,
  ranges,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  text: string;
  ranges: HighlightRange[];
}) {
  const [rects, setRects] = useState<{ left: number; width: number; color: string }[]>([]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || ranges.length === 0) { setRects([]); return; }
    const style = getComputedStyle(input);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const result = ranges.map((r) => ({
      left: paddingLeft + ctx.measureText(text.slice(0, r.start)).width,
      width: ctx.measureText(text.slice(r.start, r.end)).width,
      color: r.color,
    }));
    setRects(result);
  }, [inputRef, text, ranges]);

  return (
    <>
      {rects.map((r, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute rounded-[3px] pointer-events-none z-0"
          style={{
            left: r.left - 2,
            width: r.width + 4,
            top: 2,
            bottom: 2,
            backgroundColor: r.color,
          }}
        />
      ))}
    </>
  );
}

// ─── Mention Dropdown ─────────────────────────────────────────────────────

interface MentionOption {
  id: string;
  name: string;
  type: 'member' | 'client';
}

function MentionDropdown({
  inputRef,
  query,
  options,
  selectedIdx,
  onSelect,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  options: MentionOption[];
  selectedIdx: number;
  onSelect: (option: MentionOption) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    // Position below the input, left-aligned
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [inputRef, query]);

  if (!pos || options.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[100] w-[240px] rounded-xl border border-white/[0.08] bg-surface/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Team members
      </div>
      {options.map((opt, i) => (
        <button
          key={opt.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(opt); }}
          className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-sm transition-colors cursor-pointer ${
            i === selectedIdx ? 'bg-white/[0.08] text-text-primary' : 'text-text-secondary hover:bg-white/[0.04]'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-accent-surface flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-accent-text">
              {opt.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <span className="truncate">{opt.name}</span>
          {opt.type === 'client' && (
            <span className="ml-auto text-[10px] text-text-muted">Client</span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function InlineAddTask({
  defaultDate,
  clients,
  teamMembers = [],
  onAdd,
}: {
  defaultDate?: string;
  clients: TaskClient[];
  teamMembers?: TaskAssignee[];
  onAdd: (task: Task) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('low');
  const [dueDate, setDueDate] = useState(defaultDate ?? '');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mention state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionInserted, setMentionInserted] = useState<{ name: string; id: string; type: 'member' | 'client' } | null>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function reset() {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate(defaultDate ?? '');
    setClientId('');
    setAssigneeId('');
    setMentionActive(false);
    setMentionQuery('');
    setMentionIdx(0);
    setMentionInserted(null);
  }

  // ── Mention options ──────────────────────────────────────────────────

  const allMentionOptions: MentionOption[] = useMemo(() => [
    ...teamMembers.map((m) => ({ id: m.id, name: m.full_name, type: 'member' as const })),
    ...clients.map((c) => ({ id: c.id, name: c.name, type: 'client' as const })),
  ], [teamMembers, clients]);

  const filteredMentionOptions = useMemo(() => {
    if (!mentionActive) return [];
    const q = mentionQuery.toLowerCase();
    return allMentionOptions
      .filter((o) => o.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionActive, mentionQuery, allMentionOptions]);

  // ── Detect @mention while typing ─────────────────────────────────────

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setTitle(val);

    // Check for @ trigger
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setMentionActive(true);
      setMentionQuery(atMatch[1]);
      setMentionIdx(0);
    } else {
      setMentionActive(false);
      setMentionQuery('');
    }

    // If the inserted mention was edited/removed, clear it
    if (mentionInserted && !val.toLowerCase().includes(`@${mentionInserted.name.toLowerCase()}`)) {
      setMentionInserted(null);
      // Revert assignee if it was set by mention
      setAssigneeId('');
    }
  }

  function handleMentionSelect(option: MentionOption) {
    const cursorPos = inputRef.current?.selectionStart ?? title.length;
    const textBeforeCursor = title.slice(0, cursorPos);
    const atIdx = textBeforeCursor.lastIndexOf('@');
    if (atIdx === -1) return;

    // Replace @query with @Name
    const newTitle = title.slice(0, atIdx) + `@${option.name} ` + title.slice(cursorPos);
    setTitle(newTitle);
    setMentionActive(false);
    setMentionQuery('');
    setMentionInserted({ name: option.name, id: option.id, type: option.type });

    // Set assignee or client based on type
    if (option.type === 'member') {
      setAssigneeId(option.id);
    } else {
      setClientId(option.id);
    }

    // Re-focus and place cursor after the inserted name
    setTimeout(() => {
      const pos = atIdx + option.name.length + 2; // +2 for @ and space
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  }

  // ── Submit ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!title.trim() || submitting) return;

    // Strip @mention, date, and recurrence from title
    let cleanTitle = title.trim();
    const escMention = mentionInserted
      ? new RegExp(`@${mentionInserted.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`, 'i')
      : null;

    if (escMention) cleanTitle = cleanTitle.replace(escMention, '').trim();
    if (extractedRecurrence) {
      cleanTitle = cleanTitle.replace(new RegExp(extractedRecurrence.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
    }
    if (extracted) {
      cleanTitle = cleanTitle.replace(new RegExp(extracted.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
    }
    cleanTitle = cleanTitle.replace(/\s{2,}/g, ' ').trim();

    const finalDueDate = dueDate;

    setSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          description: description.trim() || null,
          status: 'backlog',
          priority,
          due_date: finalDueDate || null,
          client_id: clientId || null,
          assignee_id: assigneeId || null,
          task_type: 'content',
          recurrence: extractedRecurrence?.recurrence.pattern ?? null,
          recurrence_from_completion: extractedRecurrence?.recurrence.fromCompletion ?? false,
        }),
      });
      if (!res.ok) throw new Error('Failed to create task');
      const newTask = await res.json();
      onAdd(newTask);
      reset();
      inputRef.current?.focus();
    } catch {
      toast.error('Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Mention dropdown navigation
    if (mentionActive && filteredMentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, filteredMentionOptions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(filteredMentionOptions[mentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionActive(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      reset();
    }
  }

  // ── Smart date + recurrence extraction ────────────────────────────────

  const extracted = useMemo(() => extractDateFromText(title), [title]);
  const extractedRecurrence = useMemo(() => extractRecurrenceFromText(title), [title]);
  const prevExtractedDate = useRef<string | null>(null);

  // Auto-update due date from extracted date or recurrence's first due date
  const extractedDate = extracted?.date ?? extractedRecurrence?.recurrence.firstDueDate ?? null;
  useEffect(() => {
    if (extractedDate !== null) {
      if (prevExtractedDate.current !== extractedDate) {
        prevExtractedDate.current = extractedDate;
        queueMicrotask(() => setDueDate(extractedDate));
      }
    } else if (prevExtractedDate.current !== null) {
      prevExtractedDate.current = null;
      queueMicrotask(() => setDueDate(defaultDate ?? ''));
    }
  }, [extractedDate, defaultDate]);

  // ── Build highlight ranges ───────────────────────────────────────────

  const highlightRanges = useMemo(() => {
    const ranges: HighlightRange[] = [];
    const lower = title.toLowerCase();

    // Date highlight (blue)
    if (extracted) {
      const idx = lower.indexOf(extracted.matchedText);
      if (idx !== -1) {
        ranges.push({
          start: idx,
          end: idx + extracted.matchedText.length,
          color: 'rgba(4, 107, 210, 0.35)',
        });
      }
    }

    // Recurrence highlight (green)
    if (extractedRecurrence) {
      const idx = lower.indexOf(extractedRecurrence.matchedText);
      if (idx !== -1) {
        ranges.push({
          start: idx,
          end: idx + extractedRecurrence.matchedText.length,
          color: 'rgba(34, 197, 94, 0.35)',
        });
      }
    }

    // Mention highlight (purple)
    if (mentionInserted) {
      const mentionStr = `@${mentionInserted.name.toLowerCase()}`;
      const idx = lower.indexOf(mentionStr);
      if (idx !== -1) {
        ranges.push({
          start: idx,
          end: idx + mentionStr.length,
          color: 'rgba(168, 85, 247, 0.35)',
        });
      }
    }

    return ranges;
  }, [title, extracted, extractedRecurrence, mentionInserted]);

  // ── UI helpers ───────────────────────────────────────────────────────

  const selectedPriority = PRIORITY_OPTIONS.find((p) => p.value === priority);

  const priorityOptions = PRIORITY_OPTIONS.map((p) => ({
    value: p.value,
    label: p.label,
    icon: <Flag size={12} style={{ color: p.color }} />,
  }));

  const clientOptions = [
    { value: '', label: 'No client' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  const assigneeOptions = [
    { value: '', label: 'Me' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.full_name })),
  ];

  return (
    <div className="mt-1">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="add-btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileHover={{ x: 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 py-2 px-1 w-full text-accent-text/70 hover:text-accent-text transition-colors cursor-pointer group"
          >
            <span className="relative flex items-center justify-center w-5 h-5">
              <span className="absolute inset-0 rounded-full bg-accent-text/0 group-hover:bg-accent-text scale-75 group-hover:scale-100 transition-all duration-200" />
              <Plus size={14} className="relative text-accent-text group-hover:text-white transition-colors duration-200" />
            </span>
            <span className="text-sm">Add task</span>
          </motion.button>
        ) : (
          <motion.div
            key="add-form"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-full rounded-xl border border-nativz-border bg-surface shadow-elevated">
              <div className="px-3 pt-3 pb-1">
                {/* Title input with inline highlights */}
                <div className="relative">
                  <HighlightOverlays
                    inputRef={inputRef}
                    text={title}
                    ranges={highlightRanges}
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Task name"
                    className="relative z-10 w-full bg-transparent text-sm font-medium text-text-primary placeholder-text-muted/50 outline-none"
                  />
                  {/* @mention dropdown */}
                  {mentionActive && (
                    <MentionDropdown
                      inputRef={inputRef}
                      query={mentionQuery}
                      options={filteredMentionOptions}
                      selectedIdx={mentionIdx}
                      onSelect={handleMentionSelect}
                    />
                  )}
                </div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Description"
                  className="w-full bg-transparent text-xs text-text-secondary placeholder-text-muted/40 outline-none mt-1"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap px-3 py-2">
                <DateChip value={dueDate} onChange={setDueDate} />
                <SelectTrigger
                  options={priorityOptions}
                  value={priority}
                  onChange={setPriority}
                  icon={<Flag size={12} style={{ color: selectedPriority?.color }} />}
                  placeholder="Priority"
                  className="h-7 rounded-md border border-nativz-border/60 px-2 text-xs text-text-muted hover:text-text-secondary hover:border-nativz-border"
                  width={180}
                />
              </div>

              <div className="flex items-center justify-between px-3 py-2 border-t border-nativz-border/50">
                <div className="flex items-center gap-2">
                  <SelectTrigger
                    options={clientOptions}
                    value={clientId}
                    onChange={setClientId}
                    icon={<Inbox size={13} />}
                    placeholder="No client"
                    searchable={clients.length > 5}
                    className="text-xs text-text-muted hover:text-text-secondary"
                    width={200}
                  />
                  {teamMembers.length > 0 && (
                    <SelectTrigger
                      options={assigneeOptions}
                      value={assigneeId}
                      onChange={setAssigneeId}
                      icon={<User size={13} />}
                      placeholder="Me"
                      searchable={teamMembers.length > 5}
                      className="text-xs text-text-muted hover:text-text-secondary"
                      width={200}
                    />
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setIsOpen(false); reset(); }}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!title.trim() || submitting}
                    className="h-7 w-7 flex items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer"
                    title="Add task"
                  >
                    {submitting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
