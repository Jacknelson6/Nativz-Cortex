'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useBrandMode } from './brand-mode-provider';

/**
 * Agency logo pinned to the top-left of the admin shell, detached from the
 * sidebar. Always visible at large size regardless of sidebar mode
 * (expanded / collapsed / hover). Click shows the "Hi there!" tooltip —
 * same easter egg the sidebar logo used to have.
 */
export function AgencyLogo() {
  const { mode } = useBrandMode();
  const [showHiTooltip, setShowHiTooltip] = useState(false);

  // Left offset mirrors the sidebar's inner padding (SidebarContent px-3 +
  // SidebarMenuButton px-2.5 = 1.375rem), so the logo visually aligns with
  // the nav item icons and section labels underneath it.
  return (
    <div className="fixed top-3 left-[1.375rem] z-40 pointer-events-none">
      <button
        type="button"
        onClick={() => {
          setShowHiTooltip(true);
          setTimeout(() => setShowHiTooltip(false), 2200);
        }}
        aria-label="Hi there!"
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
