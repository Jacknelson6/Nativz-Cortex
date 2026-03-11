'use client';

import { useRef, useLayoutEffect } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  children,
  blockEnterSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  children?: React.ReactNode;
  /** When true, Enter selects from an autocomplete instead of submitting */
  blockEnterSubmit?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxHeight = 200;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (blockEnterSubmit) return;
      if (value.trim() && !disabled) onSubmit();
    }
  }

  return (
    <div
      className="relative w-full rounded-2xl border border-nativz-border bg-surface transition-colors focus-within:border-accent/30 cursor-text"
      onClick={() => textareaRef.current?.focus()}
    >
      {/* Slot for mention autocomplete etc. */}
      {children}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Type a message...'}
        rows={1}
        disabled={disabled}
        className="min-h-[48px] w-full resize-none border-none bg-transparent px-4 pt-3 pb-12 text-sm text-text-primary placeholder:text-text-muted/60 outline-none leading-relaxed"
      />

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-3 pb-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto" id="prompt-input-extras" />
        <button
          onClick={onSubmit}
          disabled={!value.trim() || disabled}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-text-primary text-background transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer hover:opacity-80"
        >
          {disabled ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ArrowUp size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
