'use client';

import { useState, useRef } from 'react';
import { Copy, Check, RotateCcw, Loader2, BotMessageSquare, FileDown } from 'lucide-react';
import { Markdown } from './markdown';
import { ToolCard, type ToolResultData } from './tool-card';
import { exportElementToPdf } from '@/lib/chat-export-pdf';

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: ToolResultData;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolResults?: ToolResult[];
  createdAt?: number;
}

function formatRelativeTimestamp(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function MessageActions({
  content,
  onRetry,
  isLast,
  exportRootRef,
}: {
  content: string;
  onRetry: () => void;
  isLast: boolean;
  exportRootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  function handleCopy() {
    // Strip markdown to copy as plain text
    const plain = content
      .replace(/^#{1,6}\s+/gm, '')        // headings
      .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
      .replace(/\*(.+?)\*/g, '$1')        // italic
      .replace(/__(.+?)__/g, '$1')        // bold alt
      .replace(/_(.+?)_/g, '$1')          // italic alt
      .replace(/~~(.+?)~~/g, '$1')        // strikethrough
      .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')) // code blocks
      .replace(/`(.+?)`/g, '$1')          // inline code
      .replace(/^\s*[-*+]\s+/gm, '• ')    // unordered lists
      .replace(/^\s*\d+\.\s+/gm, '')      // ordered lists
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .replace(/!\[.*?\]\(.+?\)/g, '')    // images
      .replace(/^>\s+/gm, '')             // blockquotes
      .replace(/^---+$/gm, '')            // horizontal rules
      .replace(/\n{3,}/g, '\n\n');        // excess newlines
    navigator.clipboard.writeText(plain.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExportPdf() {
    const el = exportRootRef.current;
    if (!el) return;
    setPdfBusy(true);
    try {
      await exportElementToPdf(el, 'cortex-message.pdf');
    } catch {
      /* toast optional */
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className={`flex gap-0.5 mt-1.5 transition-opacity duration-150 ${isLast ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer"
        title="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={pdfBusy}
        className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
        title="Download PDF"
      >
        {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      </button>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer"
        title="Retry"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

export function AssistantMessage({
  message,
  isLast,
  onRetry,
}: {
  message: ChatMessage;
  isLast: boolean;
  onRetry: () => void;
}) {
  const exportRootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="group flex gap-3 py-5">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-surface to-[#0d0d14] shadow-sm">
        <BotMessageSquare size={16} className="text-accent-text" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        {message.createdAt && (
          <span className="mb-1 block text-[10px] text-text-muted/0 transition-colors group-hover:text-text-muted/60">
            {formatRelativeTimestamp(message.createdAt)}
          </span>
        )}
        <div ref={exportRootRef} className="text-text-primary">
          {/* Tool results */}
          {message.toolResults && message.toolResults.length > 0 && (
            <div className="mb-3">
              {message.toolResults.map((tr, i) => (
                <ToolCard key={`${tr.toolCallId}-${i}`} toolName={tr.toolName} result={tr.result} />
              ))}
            </div>
          )}

          {/* Text content + rich blocks */}
          {message.content ? (
            <Markdown content={message.content} />
          ) : (
            <div className="flex items-center gap-2 py-1 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {message.content && (
          <MessageActions
            content={message.content}
            onRetry={onRetry}
            isLast={isLast}
            exportRootRef={exportRootRef}
          />
        )}
      </div>
    </div>
  );
}

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="group flex justify-end py-5">
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[80%] rounded-2xl bg-surface-hover/80 px-4 py-2.5">
          <p className="text-sm text-text-primary whitespace-pre-wrap">{message.content}</p>
        </div>
        {message.createdAt && (
          <span className="px-1 text-[10px] text-text-muted/0 transition-colors group-hover:text-text-muted/60">
            {formatRelativeTimestamp(message.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}
