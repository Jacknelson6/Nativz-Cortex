'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * CSS-only confetti burst for the moment a client hits 100% on their
 * onboarding. Taste notes:
 *  - One-shot (auto-cleans after 2.5s)
 *  - Small particle count so it reads as \u201ca nod\u201d, not \u201ca Vegas parade\u201d
 *  - Uses brand cyan + emerald + gold so it feels on-brand, not random
 *  - pointer-events-none so it never blocks interaction
 *
 * Prop `fire` flips true \u2192 the effect mounts, then unmounts itself.
 */
const CONFETTI_COLORS = ['#00AEEF', '#22C55E', '#F59E0B', '#FFFFFF'];

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotate: number;
  drift: number;
};

export function OnboardingConfetti({ fire }: { fire: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!fire) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [fire]);

  const pieces = useMemo<Piece[]>(() => {
    if (!visible) return [];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 200,
      duration: 1400 + Math.random() * 700,
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 160,
    }));
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block animate-[confettiFall_var(--d)_ease-out_forwards]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            borderRadius: 1.5,
            transform: `rotate(${p.rotate}deg)`,
            animationDelay: `${p.delay}ms`,
            ['--d' as string]: `${p.duration}ms`,
            ['--dx' as string]: `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translate3d(0, -10vh, 0) rotate(0); opacity: 1; }
          100% { transform: translate3d(var(--dx), 110vh, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
