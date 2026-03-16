'use client';

import { useState } from 'react';
import { Copy, Check, RotateCcw, Loader2, BotMessageSquare } from 'lucide-react';
import { Markdown } from './markdown';
import { ToolCard, type ToolResultData } from './tool-card';

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
}

function MessageActions({
  messageId,
  content,
  onRetry,
  isLast,
}: {
  messageId: string;
  content: string;
  onRetry: () => void;
  isLast: boolean;
}) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div className={`flex gap-0.5 mt-1.5 transition-opacity duration-150 ${isLast ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <button
        onClick={handleCopy}
        className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer"
        title="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <button
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
  return (
    <div className="group flex gap-3 py-5">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-surface to-[#0d0d14] shadow-sm">
        <BotMessageSquare size={16} className="text-accent-text" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        {/* Tool results */}
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mb-3">
            {message.toolResults.map((tr, i) => (
              <ToolCard key={`${tr.toolCallId}-${i}`} toolName={tr.toolName} result={tr.result} />
            ))}
          </div>
        )}

        {/* Text content */}
        {message.content ? (
          <div className="text-text-secondary">
            <Markdown content={message.content} />
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        {/* Actions */}
        {message.content && (
          <MessageActions
            messageId={message.id}
            content={message.content}
            onRetry={onRetry}
            isLast={isLast}
          />
        )}
      </div>
    </div>
  );
}

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end py-5">
      <div className="max-w-[80%] rounded-2xl bg-surface-hover/80 px-4 py-2.5">
        <p className="text-sm text-text-primary whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
