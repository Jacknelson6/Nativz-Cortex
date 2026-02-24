'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  id?: string;
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  error?: string;
}

export function TagInput({
  id,
  label,
  value,
  onChange,
  placeholder = 'Type and press Enter',
  maxTags = 20,
  error,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) return;
    if (value.length >= maxTags) return;
    onChange([...value, tag]);
    setInput('');
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text');
    if (text.includes(',')) {
      e.preventDefault();
      const tags = text.split(',').map((t) => t.trim()).filter(Boolean);
      const unique = tags.filter((t) => !value.includes(t));
      const allowed = unique.slice(0, maxTags - value.length);
      if (allowed.length > 0) {
        onChange([...value, ...allowed]);
      }
      setInput('');
    }
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 rounded-lg border bg-white/[0.03] px-2.5 py-2 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 focus-within:shadow-[0_0_0_3px_rgba(43,125,233,0.12)] hover:border-white/[0.12] ${
          error ? 'border-red-500' : 'border-white/[0.08]'
        }`}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text animate-fade-in"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="rounded-sm p-0.5 hover:bg-accent/20 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => addTag(input)}
          placeholder={value.length === 0 ? placeholder : value.length >= maxTags ? 'Max reached' : ''}
          disabled={value.length >= maxTags}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
