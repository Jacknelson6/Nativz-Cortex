'use client';

import { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`fixed bottom-6 right-6 z-40 flex h-10 items-center gap-1.5 rounded-full border border-nativz-border bg-surface/80 px-3 shadow-card-hover backdrop-blur-sm transition-all duration-300 hover:bg-surface-hover ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
    >
      <ChevronUp size={16} className="text-text-secondary" />
      <span className="text-xs font-medium text-text-secondary">Top</span>
    </button>
  );
}
