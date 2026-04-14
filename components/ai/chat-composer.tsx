'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import {
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Search,
  BookOpen,
  Palette,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { PromptInput, type PromptInputVariant } from './prompt-input';

// ---------------------------------------------------------------------------
// Attachment types
// ---------------------------------------------------------------------------

export type AttachmentType = 'file' | 'research' | 'knowledge' | 'moodboard';

export interface ChatAttachment {
  /** Unique key for React lists + deduplication. */
  id: string;
  type: AttachmentType;
  /** Display name shown in the chip. */
  name: string;
  /** For file attachments — the raw File object (not yet uploaded). */
  file?: File;
  /** For research/knowledge/moodboard — the DB row ID. */
  refId?: string;
  /** MIME type for files. */
  mimeType?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (attachments: ChatAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Pass-through for autocomplete menus (slash commands, mentions). */
  children?: ReactNode;
  blockEnterSubmit?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  variant?: PromptInputVariant;
  /**
   * Accepted file types for the file input.
   * Defaults to PDFs + images + common text files.
   */
  acceptFileTypes?: string;
  /** Called when user clicks "Attach research" — parent opens picker. */
  onAttachResearch?: () => void;
  /** Called when user clicks "Attach knowledge entry" — parent opens picker. */
  onAttachKnowledge?: () => void;
  /** Called when user clicks "Attach moodboard" — parent opens picker. */
  onAttachMoodboard?: () => void;
  /** Externally-managed attachments (e.g. from research/knowledge pickers). */
  externalAttachments?: ChatAttachment[];
  /** Called when an external attachment is dismissed. */
  onRemoveExternalAttachment?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCEPT_DEFAULT =
  'application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,text/csv';

function attachmentIcon(type: AttachmentType, mimeType?: string) {
  if (type === 'research') return <Search size={12} aria-hidden />;
  if (type === 'knowledge') return <BookOpen size={12} aria-hidden />;
  if (type === 'moodboard') return <Palette size={12} aria-hidden />;
  if (mimeType?.startsWith('image/')) return <ImageIcon size={12} aria-hidden />;
  return <FileText size={12} aria-hidden />;
}

function truncateName(name: string, max = 24) {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 6) {
    // Keep extension visible: "long-file-na….pdf"
    return `${name.slice(0, max - name.length + ext - 1)}…${name.slice(ext)}`;
  }
  return `${name.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  children,
  blockEnterSubmit,
  onKeyDown,
  variant = 'default',
  acceptFileTypes,
  onAttachResearch,
  onAttachKnowledge,
  onAttachMoodboard,
  externalAttachments = [],
  onRemoveExternalAttachment,
}: ChatComposerProps) {
  const [fileAttachments, setFileAttachments] = useState<ChatAttachment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const allAttachments = [...externalAttachments, ...fileAttachments];

  // ---- File handling -------------------------------------------------------

  const addFiles = useCallback((files: FileList | File[]) => {
    const newAttachments: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      newAttachments.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'file',
        name: file.name,
        file,
        mimeType: file.type,
      });
    }
    setFileAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeFileAttachment = useCallback((id: string) => {
    setFileAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const removeAttachment = useCallback(
    (att: ChatAttachment) => {
      if (att.type === 'file') {
        removeFileAttachment(att.id);
      } else {
        onRemoveExternalAttachment?.(att.id);
      }
    },
    [removeFileAttachment, onRemoveExternalAttachment],
  );

  // ---- Submit (includes attachments) ---------------------------------------

  const handleSubmit = useCallback(() => {
    onSubmit(allAttachments);
    setFileAttachments([]);
  }, [onSubmit, allAttachments]);

  // ---- Drag-and-drop -------------------------------------------------------

  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  // ---- Menu items ----------------------------------------------------------

  const menuItems = [
    {
      label: 'Upload file',
      icon: <Upload size={14} aria-hidden />,
      onClick: () => {
        fileInputRef.current?.click();
        setMenuOpen(false);
      },
      always: true,
    },
    {
      label: 'Attach research',
      icon: <Search size={14} aria-hidden />,
      onClick: () => {
        onAttachResearch?.();
        setMenuOpen(false);
      },
      always: !!onAttachResearch,
    },
    {
      label: 'Attach knowledge entry',
      icon: <BookOpen size={14} aria-hidden />,
      onClick: () => {
        onAttachKnowledge?.();
        setMenuOpen(false);
      },
      always: !!onAttachKnowledge,
    },
    {
      label: 'Attach moodboard',
      icon: <Palette size={14} aria-hidden />,
      onClick: () => {
        onAttachMoodboard?.();
        setMenuOpen(false);
      },
      always: !!onAttachMoodboard,
    },
  ].filter((item) => item.always);

  // ---- Render --------------------------------------------------------------

  return (
    <div
      className="relative w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay — pointer-events-none so it doesn't block input */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent/50 bg-accent/10 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-accent-text">
            <Upload size={18} aria-hidden />
            Drop files to attach
          </div>
        </div>
      )}

      {/* Attachment tray — above input */}
      {allAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {allAttachments.map((att) => (
            <div
              key={att.id}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/60 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent/30"
            >
              {attachmentIcon(att.type, att.mimeType)}
              <span className="max-w-[140px] truncate">{truncateName(att.name)}</span>
              <button
                type="button"
                onClick={() => removeAttachment(att)}
                className="ml-0.5 rounded p-0.5 text-text-muted opacity-60 transition hover:bg-red-500/15 hover:text-red-400 hover:opacity-100"
                aria-label={`Remove ${att.name}`}
              >
                <X size={10} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Wrapped PromptInput with paperclip */}
      <div className="relative">
        <PromptInput
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          disabled={disabled}
          placeholder={placeholder}
          blockEnterSubmit={blockEnterSubmit}
          onKeyDown={onKeyDown}
          variant={variant}
        >
          {children}
        </PromptInput>

        {/* Paperclip + research "+" buttons — bottom-left of the input */}
        <div
          className={cn(
            'absolute z-10 flex items-center gap-1',
            variant === 'research'
              ? 'bottom-0 left-0 px-3 pb-3'
              : 'bottom-0 left-0 px-3 pb-2.5',
          )}
        >
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className={cn(
                'flex items-center justify-center rounded-full text-text-muted transition hover:text-text-primary',
                variant === 'research' ? 'h-9 w-9' : 'h-8 w-8',
              )}
              aria-label="Attach files"
              title="Attach file"
            >
              <Paperclip
                size={variant === 'research' ? 17 : 16}
                aria-hidden
              />
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <>
                {/* Backdrop to close menu */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[200px] overflow-hidden rounded-lg border border-nativz-border bg-surface shadow-xl">
                  {menuItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onClick}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                    >
                      <span className="text-text-muted">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Dedicated research "+" button — only renders when the parent wired
              up onAttachResearch. Lets the user add a topic search from the
              composer without opening the paperclip menu. */}
          {onAttachResearch && (
            <button
              type="button"
              onClick={() => onAttachResearch()}
              className={cn(
                'flex items-center justify-center rounded-full text-text-muted transition hover:text-accent-text',
                variant === 'research' ? 'h-9 w-9' : 'h-8 w-8',
              )}
              aria-label="Attach research"
              title="Attach research topic"
            >
              <Search size={variant === 'research' ? 16 : 15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptFileTypes ?? ACCEPT_DEFAULT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          // Reset so same file can be re-selected
          e.target.value = '';
        }}
      />
    </div>
  );
}
