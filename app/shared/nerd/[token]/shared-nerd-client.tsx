'use client';

import { BotMessageSquare, MessageSquare } from 'lucide-react';
import { Markdown } from '@/components/ai/markdown';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';

interface SharedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SharedNerdClientProps {
  title: string;
  clientName: string | null;
  createdAt: string;
  messages: SharedMessage[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function SharedNerdClient({
  title,
  clientName,
  createdAt,
  messages,
}: SharedNerdClientProps) {
  const { brandName } = useAgencyBrand();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-nativz-border bg-surface/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-surface to-[#0d0d14]">
              <BotMessageSquare size={18} className="text-accent-text" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-text-primary">{title}</h1>
              <p className="text-xs text-text-muted">
                {clientName && <span>{clientName} &middot; </span>}
                {formatDate(createdAt)} &middot; {brandName} Cortex
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <div className="divide-y divide-nativz-border/30">
          {messages.map((msg) => {
            if (msg.role === 'assistant') {
              return (
                <div key={msg.id} className="flex gap-3 py-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-surface to-[#0d0d14] shadow-sm">
                    <BotMessageSquare size={16} className="text-accent-text" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5 text-text-secondary">
                    <Markdown content={msg.content} />
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex justify-end py-5">
                <div className="max-w-[80%] rounded-2xl bg-surface-hover/80 px-4 py-2.5">
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-nativz-border/30 pt-4 text-center">
          <p className="text-xs text-text-muted">
            <MessageSquare size={12} className="mr-1 inline-block" />
            Shared from {brandName} Cortex &middot; {messages.length} messages
          </p>
        </div>
      </main>
    </div>
  );
}
