'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MoodboardItem, MoodboardNote } from '@/lib/types/moodboard';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

interface AiChatPanelProps {
  boardId: string;
  items: MoodboardItem[];
  notes: MoodboardNote[];
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

    // Standalone bold line → treat as subheading
    const boldLineMatch = line.match(/^\*\*(.+?)\*\*:?$/);
    if (boldLineMatch) {
      elements.push(<h4 key={i} className="font-semibold text-sm text-white mt-3 mb-1">{boldLineMatch[1]}</h4>);
      return;
    }

    // Bullets — only match single - or * followed by space (not **)
    const bulletMatch = line.match(/^(\s*)[-]\s+(.*)|^(\s*)\*\s+(.*)/);
    if (bulletMatch) {
      const indent = (bulletMatch[1] || bulletMatch[3] || '').length > 0 ? 'ml-4' : '';
      const text = bulletMatch[2] || bulletMatch[4];
      elements.push(
        <div key={i} className={`flex gap-2 ${indent}`}>
          <span className="text-blue-400 shrink-0">&bull;</span>
          <span className="text-sm">{formatInline(text)}</span>
        </div>
      );
      return;
    }

    // Numbered lists
    const numberedMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <div key={i} className="flex gap-2">
          <span className="text-blue-400 shrink-0">&bull;</span>
          <span className="text-sm">{formatInline(numberedMatch[2])}</span>
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
  // Bold, italic, and inline code
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*([^*]+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-white">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={match.index} className="bg-black/30 rounded px-1 py-0.5 text-xs font-mono text-blue-300">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? <>{parts}</> : text;
}

export function AiChatPanel({ boardId, items, notes, onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // @mention state
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionedClientSlugs, setMentionedClientSlugs] = useState<string[]>([]);

  // Fetch clients list once for @mention autocomplete
  useEffect(() => {
    fetch('/api/clients')
      .then(res => res.ok ? res.json() : [])
      .then(data => setClients(Array.isArray(data) ? data.map((c: { id: string; name: string; slug: string }) => ({ id: c.id, name: c.name, slug: c.slug })) : []))
      .catch(() => {});
  }, []);

  // Auto-include all videos and websites
  const videoItems = items.filter(i => i.type === 'video');
  const websiteItems = items.filter(i => i.type === 'website');
  const contentItemIds = [...videoItems, ...websiteItems].map(i => i.id);
  const contentLabel = [
    videoItems.length > 0 ? `${videoItems.length} video${videoItems.length !== 1 ? 's' : ''}` : '',
    websiteItems.length > 0 ? `${websiteItems.length} website${websiteItems.length !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' and ');

  // Extract @mentions from input
  const mentionMatches = mentionQuery !== null
    ? clients.filter(c => c.name.toLowerCase().includes(mentionQuery.toLowerCase()) || c.slug.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

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
    if (!text || streaming) return;

    // Extract @slugs from the message for this request
    const slugRegex = /@(\S+)/g;
    const slugsInMessage: string[] = [];
    let slugMatch: RegExpExecArray | null;
    while ((slugMatch = slugRegex.exec(text)) !== null) {
      const matchedClient = clients.find(c => c.slug === slugMatch![1] || c.name.toLowerCase().replace(/\s+/g, '') === slugMatch![1].toLowerCase());
      if (matchedClient) slugsInMessage.push(matchedClient.slug);
    }
    // Merge with previously mentioned slugs
    const allSlugs = [...new Set([...mentionedClientSlugs, ...slugsInMessage])];
    if (slugsInMessage.length > 0) setMentionedClientSlugs(allSlugs);

    const userMessage: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Gather note contents for context
    const noteContents = notes.filter(n => n.content).map(n => n.content);

    try {
      const res = await fetch('/api/analysis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          item_ids: contentItemIds,
          messages: newMessages,
          note_contents: noteContents.length > 0 ? noteContents : undefined,
          client_slugs: allSlugs.length > 0 ? allSlugs : undefined,
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

  const handleInputChange = (value: string) => {
    setInput(value);
    // Detect @mention in progress
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([\w-]*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
    // Remove badges for clients whose @slug was deleted from the input
    setMentionedClientSlugs(prev => prev.filter(slug => value.includes(`@${slug}`)));
  };

  const insertMention = (client: ClientOption) => {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const newInput = input.slice(0, atIndex) + `@${client.slug} ` + input.slice(cursorPos);
    setInput(newInput);
    setMentionQuery(null);
    if (!mentionedClientSlugs.includes(client.slug)) {
      setMentionedClientSlugs(prev => [...prev, client.slug]);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle @mention navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, mentionMatches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertMention(mentionMatches[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-accent2 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Cortex AI</h2>
                <p className="text-xs text-text-muted">Creative strategist</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X size={16} />
            </Button>
          </div>

          {/* Content indicator */}
          {contentLabel && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Link2 size={12} />
              <span>Chatting with {contentLabel}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-accent2/20 border border-blue-500/20 flex items-center justify-center mb-4">
                <Sparkles size={20} className="text-blue-400" />
              </div>
              <p className="text-sm font-medium text-text-secondary mb-1">Chat with your content</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Ask about hooks, pacing, transcripts, websites, or get rescript suggestions.
                {contentLabel && (
                  <span className="block mt-1.5 text-text-muted/60">Using {contentLabel} from the board.</span>
                )}
              </p>
              <p className="text-xs text-text-muted/50 mt-2">Type <span className="text-accent-text">@clientname</span> to include client context</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {['Analyze the hooks', 'Compare these videos', 'Suggest a rescript', 'What makes this viral?'].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-nativz-border text-text-muted hover:text-text-secondary hover:border-blue-500/30 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
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
        <div className="px-4 pb-4 pt-2 border-t border-nativz-border shrink-0 relative">
          {/* @mention autocomplete dropdown */}
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-1 rounded-lg border border-nativz-border bg-surface shadow-dropdown py-1 z-10">
              {mentionMatches.map((client, i) => (
                <button
                  key={client.id}
                  onClick={() => insertMention(client)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                    i === mentionIndex ? 'bg-accent/20 text-accent-text' : 'text-text-secondary hover:bg-white/5'
                  }`}
                >
                  <span className="w-5 h-5 rounded bg-surface-hover border border-nativz-border flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0">
                    {client.name[0]}
                  </span>
                  <span className="truncate">{client.name}</span>
                  <span className="text-text-muted ml-auto shrink-0">@{client.slug}</span>
                </button>
              ))}
            </div>
          )}

          {/* Mentioned clients badges */}
          {mentionedClientSlugs.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {mentionedClientSlugs.map(slug => {
                const client = clients.find(c => c.slug === slug);
                return (
                  <span key={slug} className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-[10px] text-accent-text">
                    @{client?.name || slug}
                    <button onClick={() => setMentionedClientSlugs(prev => prev.filter(s => s !== slug))} className="hover:text-white cursor-pointer">
                      <X size={8} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your content... (type @ to mention a client)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-nativz-border bg-surface-hover px-4 py-2.5 text-sm text-white placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50 max-h-32"
              style={{ minHeight: '40px' }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              size="sm"
              className="h-10 w-10 p-0 rounded-xl bg-gradient-to-r from-blue-600 to-accent2 hover:from-blue-500 hover:to-accent2 disabled:opacity-30"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
