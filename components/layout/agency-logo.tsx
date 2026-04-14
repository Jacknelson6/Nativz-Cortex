'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useBrandMode } from './brand-mode-provider';
import { useSidebar } from './sidebar';

/**
 * Agency logo pinned to the top-left of the admin shell, detached from the
 * sidebar. Always visible at large size regardless of sidebar mode
 * (expanded / collapsed / hover). Click shows the "Hi there!" tooltip —
 * same easter egg the sidebar logo used to have.
 */
export function AgencyLogo() {
  const { mode } = useBrandMode();
  const { open } = useSidebar();
  const [showHiTooltip, setShowHiTooltip] = useState(false);

  // Logo centers in the expanded rail (240px) and fades out entirely when
  // collapsed — Supabase pattern. Constant h-11 so its bottom edge never
  // moves the rail's other elements (no more "icons jumping when the
  // logo shrinks"); we just toggle visibility instead.
  return (
    <div
      className={`fixed top-3 left-0 z-40 flex items-center justify-center transition-opacity duration-200 ease-out ${
        open ? 'opacity-100 pointer-events-none' : 'opacity-0 pointer-events-none'
      }`}
      style={{ width: 'var(--sidebar-width)' }}
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={() => {
          if (!open) return;
          setShowHiTooltip(true);
          setTimeout(() => setShowHiTooltip(false), 2200);
        }}
        aria-label="Hi there!"
        tabIndex={open ? 0 : -1}
        className="pointer-events-auto flex items-center hover:opacity-80 transition-opacity duration-200 cursor-pointer"
      >
        {mode === 'nativz' ? (
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={150}
            height={56}
            className="h-11 w-auto"
            priority
          />
        ) : (
          // Anderson Collaborative mark — SVG ships outside the Next image optimizer
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/anderson-logo-dark.svg"
            alt="Anderson Collaborative"
            className="h-11 w-auto"
          />
        )}
      </button>

      {showHiTooltip && (
        <div
          className="absolute top-full left-0 mt-2 pointer-events-none"
          style={{ animation: 'hiTooltip 2.2s cubic-bezier(0.16,1,0.3,1) forwards' }}
        >
          <div className="rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-elevated whitespace-nowrap">
            Hi there! 👋
          </div>
        </div>
      )}
    </div>
  );
}
