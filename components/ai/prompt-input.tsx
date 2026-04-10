'use client';

import { useRef, useLayoutEffect } from 'react';
import { ArrowRight, ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type PromptInputVariant = 'default' | 'research';

export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  children,
  blockEnterSubmit,
  onKeyDown: onKeyDownOverride,
  variant = 'default',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  children?: React.ReactNode;
  /** When true, Enter selects from an autocomplete instead of submitting */
  blockEnterSubmit?: boolean;
  /**
   * Parent-supplied keydown hook. Runs BEFORE PromptInput's own Enter
   * handling. If the parent calls e.preventDefault(), PromptInput bails out
   * of its default behaviour — used to wire Arrow-key navigation / Enter
   * selection into autocomplete menus (slash commands, mentions).
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Visual variant:
   * - 'default' — compact chat bubble used by the admin Nerd
   * - 'research' — the larger rounded-[1.75rem] hero shell + accent circle
   *   ArrowRight submit button from the Research page. Used by the Strategy
   *   Lab Nerd so the two surfaces feel consistent.
   */
  variant?: PromptInputVariant;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxHeight = 200;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Parent gets first crack — if they preventDefault we stop here.
    onKeyDownOverride?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (blockEnterSubmit) return;
      if (value.trim() && !disabled) onSubmit();
    }
  }

  if (variant === 'research') {
    return (
      <div
        className="relative w-full overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)] transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)] cursor-text"
        onClick={() => textareaRef.current?.focus()}
      >
        {/* Slot for autocomplete menus (slash commands, mentions) */}
        {children}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Ask Cortex about your strategy…'}
          rows={1}
          disabled={disabled}
          className="block w-full min-h-[3.25rem] resize-none border-0 bg-transparent px-5 pt-5 pb-16 text-base font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem]"
        />

        {/* Submit button — matches Research page */}
        <div className="absolute bottom-0 right-0 px-3 pb-3">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {disabled ? (
              <Loader2 size={18} className="animate-spin" aria-hidden />
            ) : (
              <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative w-full rounded-2xl border border-nativz-border bg-surface transition-colors focus-within:border-accent/30 cursor-text',
      )}
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
