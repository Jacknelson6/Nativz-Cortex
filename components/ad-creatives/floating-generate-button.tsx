'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Primary CTA for starting a new batch from the gallery — fixed bottom center so it stays reachable while scrolling.
 */
export function FloatingGenerateCreativesButton({
  onClick,
  visible,
  label = 'Generate creatives',
}: {
  onClick: () => void;
  visible: boolean;
  label?: string;
}) {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-5 pt-10 sm:pb-6"
      aria-hidden={false}
    >
      <div className="pointer-events-auto rounded-full p-0.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.08] bg-surface/90 backdrop-blur-md">
        <Button
          type="button"
          size="lg"
          shape="pill"
          className="gap-2 shadow-lg shadow-accent/20 px-6"
          onClick={onClick}
        >
          <Sparkles size={18} strokeWidth={1.75} />
          {label}
        </Button>
      </div>
    </div>
  );
}
