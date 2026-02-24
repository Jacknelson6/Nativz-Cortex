'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const COLORS = ['#2b7de9', '#8B5CF6', '#34d399', '#fbbf24', '#f43f5e', '#EC4899'];

export function EasterEgg() {
  const index = useRef(0);
  const [triggered, setTriggered] = useState(false);

  // Pre-compute random values so render is pure
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: `${(((i * 7 + 13) * 17) % 100)}%`,
        color: COLORS[i % 6],
        delay: `${(i * 37 % 500) / 1000}s`,
        duration: `${2 + (i * 53 % 200) / 100}s`,
      })),
    [],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === KONAMI[index.current]) {
        index.current++;
        if (index.current === KONAMI.length) {
          setTriggered(true);
          index.current = 0;
          setTimeout(() => setTriggered(false), 4000);
        }
      } else {
        index.current = 0;
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!triggered) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-confetti"
            style={{
              left: p.left,
              backgroundColor: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
      </div>
      <div className="relative bg-surface/95 backdrop-blur-xl border border-accent/30 rounded-2xl px-8 py-6 shadow-2xl animate-bounce-in text-center">
        <p className="text-2xl font-bold text-text-primary mb-1">
          You found it!
        </p>
        <p className="text-sm text-text-muted">
          Built with love by the Nativz team
        </p>
        <div className="mt-3 text-xs text-accent-text font-mono">
          &uarr; &uarr; &darr; &darr; &larr; &rarr; &larr; &rarr; B A
        </div>
      </div>
    </div>
  );
}
