'use client';

import { useState, useEffect, useRef } from 'react';

interface EncryptedTextProps {
  text: string;
  revealDelayMs?: number;
  characterSet?: string;
  className?: string;
}

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

export function EncryptedText({
  text,
  revealDelayMs = 50,
  characterSet = DEFAULT_CHARS,
  className = '',
}: EncryptedTextProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [scrambledChars, setScrambledChars] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    setRevealedCount(0);
    setScrambledChars(
      text.split('').map((ch) =>
        ch === ' ' ? ' ' : characterSet[Math.floor(Math.random() * characterSet.length)]
      )
    );

    // Scramble unrevealed characters
    intervalRef.current = setInterval(() => {
      setScrambledChars((prev) =>
        prev.map((ch, i) => {
          if (text[i] === ' ') return ' ';
          return characterSet[Math.floor(Math.random() * characterSet.length)];
        })
      );
    }, 40);

    // Reveal left-to-right
    revealIntervalRef.current = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, revealDelayMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
    };
  }, [text, revealDelayMs, characterSet]);

  return (
    <span className={`font-mono ${className}`} aria-label={text}>
      {text.split('').map((ch, i) => {
        const isRevealed = i < revealedCount;
        return (
          <span
            key={i}
            className={isRevealed ? 'text-text-primary font-medium' : 'text-text-muted'}
          >
            {isRevealed ? ch : (scrambledChars[i] || ch)}
          </span>
        );
      })}
    </span>
  );
}
