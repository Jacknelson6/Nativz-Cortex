'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Monitor } from 'lucide-react';

// Public client-facing surfaces that must work on mobile. The admin +
// portal are desktop-only (by design), but client-shared links like
// onboarding timelines and content-calendar review links are viewed on
// phones. Add any future public client surfaces here.
//
// `/admin/calendar` is also allowed because Google Chat notifications
// deep-link to the admin calendar from team members' phones.
const MOBILE_ALLOWED_PREFIXES = ['/onboarding/', '/c/', '/admin/calendar'];

/**
 * Detects mobile viewport and shows a full-screen overlay telling the user
 * to switch to desktop. Uses viewport width (not user-agent) for reliability.
 * Skipped entirely on public client-facing routes (see MOBILE_ALLOWED_PREFIXES).
 */
export function MobileBlocker() {
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isMobileAllowed = pathname && MOBILE_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isMobile || isMobileAllowed) return null;

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
