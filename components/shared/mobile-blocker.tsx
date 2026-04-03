'use client';

import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';

/**
 * Detects mobile viewport and shows a full-screen overlay telling the user
 * to switch to desktop. Uses viewport width (not user-agent) for reliability.
 */
export function MobileBlocker() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface mb-6">
        <Monitor size={32} className="text-accent-text" />
      </div>
      <h1 className="text-xl font-semibold text-text-primary mb-3">
        Desktop only
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-text-muted">
        Cortex is designed for desktop. Mobile support is coming soon — please switch to a computer for the best experience.
      </p>
    </div>
  );
}
