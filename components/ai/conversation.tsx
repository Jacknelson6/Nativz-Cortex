'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { ArrowDown } from 'lucide-react';

export function Conversation({
  children,
  className,
  autoScroll = true,
}: {
  children: React.ReactNode;
  className?: string;
  autoScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const threshold = 100;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setIsAtBottom(atBottom);
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll when new content arrives and user is near bottom
  useEffect(() => {
    if (autoScroll && isAtBottom) {
      scrollToBottom();
    }
  });

  return (
    <div ref={containerRef} className={`relative flex-1 overflow-y-auto ${className ?? ''}`}>
      {children}
      <div ref={bottomRef} />

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface/95 px-3 py-1.5 text-xs text-text-muted shadow-elevated backdrop-blur-sm hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowDown size={12} />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
