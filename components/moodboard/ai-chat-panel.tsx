'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AiChatPanelProps {
  boardId: string;
  items: MoodboardItem[];
  connectedItemIds: string[];
  onConnectedItemsChange: (ids: string[]) => void;
  onClose: () => void;
}

function SimpleMarkdown({ content }: { content: string }) {
  // Minimal markdown: headers, bold, bullets, code blocks
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-black/40 rounded-lg p-3 my-2 text-xs overflow-x-auto font-mono text-gray-300">
            {codeBuffer.join('\n')}
          </pre>
        );
        codeBuffer = [];
      }
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    let processed: React.ReactNode = line;

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-semibold text-sm text-white mt-3 mb-1">{line.slice(4)}</h4>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-semibold text-sm text-white mt-3 mb-1">{line.slice(3)}</h3>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-bold text-base text-white mt-3 mb-1">{line.slice(2)}</h2>);
      return;
    }

    // Bullets
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length > 0 ? 'ml-4' : '';
      elements.push(
        <div key={i} className={`flex gap-2 ${indent}`}>
          <span className="text-blue-400 shrink-0">•</span>
          <span className="text-sm">{formatInline(bulletMatch[2])}</span>
        </div>
      );
      return;
    }

    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    elements.push(<p key={i} className="text-sm">{formatInline(line)}</p>);
  });

  if (inCodeBlock && codeBuffer.length) {
    elements.push(
      <pre key="code-final" className="bg-black/40 rounded-lg p-3 my-2 text-xs overflow-x-auto font-mono text-gray-300">
        {codeBuffer.join('\n')}
      </pre>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  // Bold and inline code
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-white">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={match.index} className="bg-black/30 rounded px-1 py-0.5 text-xs font-mono text-blue-300">{match[3]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? <>{parts}</> : text;
}

export function AiChatPanel({ boardId, items, connectedItemIds, onConnectedItemsChange, onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connectedItems = items.filter(i => connectedItemIds.includes(i.id));

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming || connectedItemIds.length === 0) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/moodboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          item_ids: connectedItemIds,
          messages: newMessages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error || 'Failed to get response'}` }]);
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Connection failed. Please try again.' }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleItem = (itemId: string) => {
    if (connectedItemIds.includes(itemId)) {
      onConnectedItemsChange(connectedItemIds.filter(id => id !== itemId));
    } else {
      onConnectedItemsChange([...connectedItemIds, itemId]);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-[480px] border-l border-nativz-border bg-surface shadow-elevated overflow-hidden flex flex-col animate-fade-slide-in">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-nativz-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Cortex AI</h2>
                <p className="text-[11px] text-text-muted">Creative strategist</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X size={16} />
            </Button>
          </div>

          {/* Connected items */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowItemPicker(!showItemPicker)}
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            >
              <Link2 size={12} />
              {connectedItems.length} item{connectedItems.length !== 1 ? 's' : ''} connected
            </button>
            <div className="flex gap-1 overflow-x-auto flex-1">
              {connectedItems.slice(0, 5).map(item => (
                <div key={item.id} className="relative group shrink-0">
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title || ''}
                      className="w-8 h-8 rounded object-cover border border-nativz-border"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-surface-hover border border-nativz-border flex items-center justify-center text-[9px] text-text-muted">
                      {item.type[0].toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
              {connectedItems.length > 5 && (
                <div className="w-8 h-8 rounded bg-surface-hover border border-nativz-border flex items-center justify-center text-[10px] text-text-muted shrink-0">
                  +{connectedItems.length - 5}
                </div>
              )}
            </div>
          </div>

          {/* Item picker dropdown */}
          {showItemPicker && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-nativz-border bg-surface-hover p-2 space-y-1">
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                    connectedItemIds.includes(item.id)
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'hover:bg-white/5 text-text-secondary'
                  }`}
                >
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-surface border border-nativz-border shrink-0" />
                  )}
                  <span className="truncate flex-1">{item.title || item.url}</span>
                  {connectedItemIds.includes(item.id) ? (
                    <Unlink size={12} className="shrink-0 text-blue-400" />
                  ) : (
                    <Link2 size={12} className="shrink-0 text-text-muted" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-500/20 flex items-center justify-center mb-4">
                <Sparkles size={20} className="text-blue-400" />
              </div>
              <p className="text-sm font-medium text-text-secondary mb-1">Chat with your content</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Ask about hooks, pacing, transcripts, or get rescript suggestions.
                {connectedItems.length === 0 && (
                  <span className="block mt-2 text-yellow-400/80">Connect items above to get started.</span>
                )}
              </p>
              {connectedItems.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {['Analyze the hook', 'Compare these videos', 'Suggest a rescript', 'What makes this viral?'].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-nativz-border text-text-muted hover:text-text-secondary hover:border-blue-500/30 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                    : 'bg-white/[0.06] border border-nativz-border text-text-secondary'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <SimpleMarkdown content={msg.content} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
                {msg.role === 'assistant' && msg.content === '' && streaming && (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-nativz-border shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connectedItemIds.length === 0 ? 'Connect items to start chatting...' : 'Ask about your content...'}
              disabled={connectedItemIds.length === 0}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-nativz-border bg-surface-hover px-4 py-2.5 text-sm text-white placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 max-h-32"
              style={{ minHeight: '40px' }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || streaming || connectedItemIds.length === 0}
              size="sm"
              className="h-10 w-10 p-0 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-30"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
