'use client';

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import type { MoodboardNote, StickyNoteColor } from '@/lib/types/moodboard';

interface StickyNodeData {
  note: MoodboardNote;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onColorChange: (id: string, color: StickyNoteColor) => void;
}

const STICKY_COLORS: Record<StickyNoteColor, string> = {
  yellow: 'bg-yellow-200/90 text-gray-800 border-yellow-300/50',
  blue: 'bg-blue-200/90 text-blue-900 border-blue-300/50',
  green: 'bg-emerald-200/90 text-emerald-900 border-emerald-300/50',
  pink: 'bg-pink-200/90 text-pink-900 border-pink-300/50',
  white: 'bg-white/90 text-gray-800 border-gray-200/50',
};

const COLOR_DOTS: Record<StickyNoteColor, string> = {
  yellow: 'bg-yellow-300',
  blue: 'bg-blue-300',
  green: 'bg-emerald-300',
  pink: 'bg-pink-300',
  white: 'bg-gray-300',
};

export const StickyNode = memo(function StickyNode({ data }: NodeProps<StickyNodeData>) {
  const { note, onUpdate, onDelete, onColorChange } = data;
  const [editing, setEditing] = useState(!note.content);
  const [text, setText] = useState(note.content);
  const [showColors, setShowColors] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const latestText = useRef(text);
  latestText.current = text;

  // Only sync from parent if we're not actively editing
  useEffect(() => {
    if (!editing) {
      setText(note.content);
    }
  }, [note.content, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  // Debounced auto-save while typing
  const debouncedSave = useCallback((value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (value !== note.content) {
        onUpdate(note.id, value);
      }
    }, 800);
  }, [note.id, note.content, onUpdate]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    debouncedSave(value);
  }

  function handleBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setEditing(false);
    if (latestText.current !== note.content) {
      onUpdate(note.id, latestText.current);
    }
  }

  return (
    <div className={`rounded-lg border p-3 shadow-md min-w-[160px] max-w-[280px] group ${STICKY_COLORS[note.color]}`}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all" />

      {/* Controls */}
      <div className="flex items-center justify-end gap-1 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Color picker */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowColors(!showColors); }}
            className={`cursor-pointer rounded-full w-4 h-4 border border-black/10 ${COLOR_DOTS[note.color]}`}
          />
          {showColors && (
            <div className="absolute right-0 top-full z-20 mt-1 flex gap-1 rounded-lg bg-white/95 backdrop-blur-sm p-1.5 shadow-dropdown border border-gray-200/50">
              {(Object.keys(STICKY_COLORS) as StickyNoteColor[]).map((color) => (
                <button
                  key={color}
                  onClick={(e) => { e.stopPropagation(); onColorChange(note.id, color); setShowColors(false); }}
                  className={`cursor-pointer rounded-full w-5 h-5 border border-black/10 ${COLOR_DOTS[color]} ${note.color === color ? 'ring-2 ring-gray-400' : ''}`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
          className="cursor-pointer rounded-full p-0.5 hover:bg-black/10 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      {editing ? (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === 'Escape') handleBlur(); }}
          className="w-full bg-transparent text-sm font-medium resize-none outline-none min-h-[40px] placeholder:text-black/30"
          placeholder="Type a note..."
          rows={3}
        />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="cursor-text w-full text-left text-sm font-medium whitespace-pre-wrap min-h-[20px]"
        >
          {note.content || 'Click to edit...'}
        </button>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all" />
    </div>
  );
});
