'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { MoodboardTag } from '@/lib/types/moodboard';

const TAG_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

interface TagPickerProps {
  boardId: string;
  itemId: string;
  itemTags: MoodboardTag[];
  boardTags: MoodboardTag[];
  onTagsChange: (tags: MoodboardTag[]) => void;
  onBoardTagsChange: (tags: MoodboardTag[]) => void;
}

export function TagPicker({ boardId, itemId, itemTags, boardTags, onTagsChange, onBoardTagsChange }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const itemTagIds = new Set(itemTags.map((t) => t.id));

  async function toggleTag(tag: MoodboardTag) {
    const isAdded = itemTagIds.has(tag.id);
    try {
      const res = await fetch(`/api/moodboard/items/${itemId}/tags`, {
        method: isAdded ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tag.id }),
      });
      if (!res.ok) throw new Error();
      onTagsChange(isAdded ? itemTags.filter((t) => t.id !== tag.id) : [...itemTags, tag]);
    } catch {
      toast.error('Failed to update tag');
    }
  }

  async function createTag() {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/moodboard/boards/${boardId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (!res.ok) throw new Error();
      const tag = await res.json();
      onBoardTagsChange([...boardTags, tag]);
      setNewName('');
      setCreating(false);
      // Auto-add to item
      await toggleTag(tag);
    } catch {
      toast.error('Failed to create tag');
    }
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="cursor-pointer rounded-full p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
        title="Add tag"
      >
        <Plus size={12} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {boardTags.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              {boardTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag)}
                  className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 text-left truncate">{tag.name}</span>
                  {itemTagIds.has(tag.id) && <Check size={12} className="text-accent-text shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-nativz-border mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-1.5 space-y-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createTag(); if (e.key === 'Escape') setCreating(false); }}
                  placeholder="Tag name..."
                  className="w-full rounded border border-nativz-border bg-surface px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/30"
                  autoFocus
                />
                <div className="flex gap-1">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`cursor-pointer w-4 h-4 rounded-full border-2 transition-colors ${newColor === c ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={createTag} className="cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium bg-accent text-white hover:bg-accent/80">Create</button>
                  <button onClick={() => setCreating(false)} className="cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium text-text-muted hover:bg-surface-hover">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-accent-text hover:bg-surface-hover transition-colors"
              >
                <Plus size={12} />
                Create new tag
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TagPills({ tags, onRemove }: { tags: MoodboardTag[]; onRemove?: (tagId: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          {onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }} className="cursor-pointer hover:opacity-70">
              <X size={8} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
