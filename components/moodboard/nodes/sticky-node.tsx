'use client';

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { X, Bold, Italic, Underline, AlignCenter, AlignLeft } from 'lucide-react';
import type { MoodboardNote, StickyNoteColor } from '@/lib/types/moodboard';

interface StickyNodeData {
  note: MoodboardNote;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onColorChange: (id: string, color: StickyNoteColor) => void;
}

const STICKY_COLORS: Record<StickyNoteColor, string> = {
  yellow: 'bg-surface text-text-primary border-nativz-border',
  blue: 'bg-accent-surface text-accent-text border-accent/30',
  green: 'bg-emerald-950/50 text-emerald-200 border-emerald-800/50',
  pink: 'bg-pink-950/50 text-pink-200 border-pink-800/50',
  white: 'bg-white/10 text-white border-white/20',
};

const COLOR_DOTS: Record<StickyNoteColor, string> = {
  yellow: 'bg-text-muted',
  blue: 'bg-accent',
  green: 'bg-emerald-500',
  pink: 'bg-pink-500',
  white: 'bg-white',
};

/** Check if the note's HTML content contains center-aligned blocks. */
function detectCentered(html: string): boolean {
  return /text-align:\s*center/i.test(html) || /<center>/i.test(html);
}

export const StickyNode = memo(function StickyNode({ data }: NodeProps<StickyNodeData>) {
  const { note, onUpdate, onDelete, onColorChange } = data;
  const [editing, setEditing] = useState(!note.content);
  const [showColors, setShowColors] = useState(false);
  const [centered, setCentered] = useState(() => detectCentered(note.content || ''));
  const editRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const latestContent = useRef(note.content);
  const toolbarClickRef = useRef(false);

  // Sync content from parent when not editing
  useEffect(() => {
    if (!editing && editRef.current) {
      editRef.current.innerHTML = note.content || '';
    }
  }, [note.content, editing]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      // Place cursor at end
      const sel = window.getSelection();
      if (sel && editRef.current.childNodes.length > 0) {
        sel.selectAllChildren(editRef.current);
        sel.collapseToEnd();
      }
    }
  }, [editing]);

  const getContent = useCallback(() => {
    return editRef.current?.innerHTML || '';
  }, []);

  // Debounced auto-save while typing
  const debouncedSave = useCallback((value: string) => {
    latestContent.current = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (value !== note.content) {
        onUpdate(note.id, value);
      }
    }, 800);
  }, [note.id, note.content, onUpdate]);

  function handleInput() {
    const value = getContent();
    debouncedSave(value);
  }

  function handleBlur() {
    // Skip blur if a toolbar button was just clicked
    if (toolbarClickRef.current) {
      toolbarClickRef.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setEditing(false);
    const value = getContent();
    if (value !== note.content) {
      onUpdate(note.id, value);
    }
  }

  function execFormat(command: string) {
    toolbarClickRef.current = true;
    document.execCommand(command, false);
    editRef.current?.focus();
    handleInput();
  }

  return (
    <div className={`rounded-lg border p-3 shadow-md min-w-[160px] max-w-[280px] group ${STICKY_COLORS[note.color]}`}>
      <Handle type="target" position={Position.Top} id="top-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="source" position={Position.Top} id="top-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="target" position={Position.Left} id="left-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="source" position={Position.Left} id="left-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="target" position={Position.Right} id="right-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="source" position={Position.Right} id="right-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />

      {/* Controls */}
      <div className="nodrag nopan nowheel flex items-center justify-between gap-1 mb-1">
        {/* Formatting toolbar — visible when editing + hovering */}
        {editing ? (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
              className="cursor-pointer rounded p-0.5 hover:bg-white/10 transition-colors"
              title="Bold"
            >
              <Bold size={12} />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
              className="cursor-pointer rounded p-0.5 hover:bg-white/10 transition-colors"
              title="Italic"
            >
              <Italic size={12} />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat('underline'); }}
              className="cursor-pointer rounded p-0.5 hover:bg-white/10 transition-colors"
              title="Underline"
            >
              <Underline size={12} />
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                toolbarClickRef.current = true;
                const next = !centered;
                setCentered(next);
                document.execCommand(next ? 'justifyCenter' : 'justifyLeft', false);
                editRef.current?.focus();
                handleInput();
              }}
              className="cursor-pointer rounded p-0.5 hover:bg-white/10 transition-colors"
              title="Toggle center"
            >
              {centered ? <AlignLeft size={12} /> : <AlignCenter size={12} />}
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Color picker */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowColors(!showColors); }}
              className={`cursor-pointer rounded-full w-4 h-4 border border-white/20 ${COLOR_DOTS[note.color]}`}
            />
            {showColors && (
              <div className="absolute right-0 top-full z-20 mt-1 flex gap-1 rounded-lg bg-surface backdrop-blur-sm p-1.5 shadow-dropdown border border-nativz-border">
                {(Object.keys(STICKY_COLORS) as StickyNoteColor[]).map((color) => (
                  <button
                    key={color}
                    onClick={(e) => { e.stopPropagation(); onColorChange(note.id, color); setShowColors(false); }}
                    className={`cursor-pointer rounded-full w-5 h-5 border border-white/20 ${COLOR_DOTS[color]} ${note.color === color ? 'ring-2 ring-accent' : ''}`}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
            className="cursor-pointer rounded-full p-0.5 hover:bg-surface-hover transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content — using contentEditable for rich text */}
      {editing ? (
        <div
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') handleBlur();
          }}
          className={`nodrag nowheel nopan w-full bg-transparent text-sm font-medium outline-none min-h-[40px] ${centered ? 'text-center' : 'text-left'}`}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: note.content || '' }}
        />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className={`nodrag cursor-text w-full text-sm font-medium min-h-[20px] ${centered ? 'text-center' : 'text-left'}`}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {note.content ? (
            <span dangerouslySetInnerHTML={{ __html: note.content }} />
          ) : (
            <span className="opacity-50">Click to edit...</span>
          )}
        </button>
      )}

      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
    </div>
  );
});
