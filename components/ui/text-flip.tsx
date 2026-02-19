'use client';

import { useState, useEffect, useRef } from 'react';

interface TextFlipProps {
  words: string[];
  interval?: number;
  className?: string;
}

export function TextFlip({ words, interval = 3000, className = '' }: TextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % words.length);
        setIsAnimating(false);
      }, 300);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval]);

  return (
    <span
      ref={containerRef}
      className={`inline-block overflow-hidden align-bottom ${className}`}
      style={{ height: '1.2em' }}
    >
      <span
        className="inline-block transition-all duration-300"
        style={{
          transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
          opacity: isAnimating ? 0 : 1,
          transitionTimingFunction: 'var(--ease-out-expo)',
        }}
      >
        {words[currentIndex]}
      </span>
    </span>
  );
}
