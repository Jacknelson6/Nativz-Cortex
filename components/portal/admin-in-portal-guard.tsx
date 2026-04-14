'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldAlert, LayoutDashboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SESSION_ACK_KEY = 'cortex:admin-in-portal-acknowledged';

/**
 * Safety net for admins who end up on a portal route. They used to hit an
 * endless redirect loop; now the middleware lets them through, so the main
 * risk is forgetting they're on the viewer surface while testing.
 *
 * Two elements:
 * 1. A one-time modal on first portal visit per session — "You're an admin,
 *    want to head back?" — with a "just testing" dismiss that sets a
 *    sessionStorage flag so it doesn't re-fire on route changes within the
 *    same browser tab.
 * 2. A persistent floating "Return to admin" pill in the bottom-left, sitting
 *    above where the Nerd card lives in the sidebar footer. Small enough to
 *    ignore, visible enough to click when you're done testing.
 *
 * Renders nothing if the caller isn't an admin.
 */
export function AdminInPortalGuard({ isAdmin }: { isAdmin: boolean }) {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      const acknowledged = window.sessionStorage.getItem(SESSION_ACK_KEY);
      if (!acknowledged) setShowModal(true);
    } catch {
      /* session storage unavailable — skip the modal gracefully */
    }
  }, [isAdmin]);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(SESSION_ACK_KEY, '1');
    } catch {
      /* ignore quota */
    }
    setShowModal(false);
  };

  if (!isAdmin) return null;

  return (
    <>
      {showModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-nativz-border bg-surface shadow-elevated">
            <div className="flex items-start gap-3 border-b border-nativz-border/50 px-5 py-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                <ShieldAlert size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-text-primary">
                  You&apos;re signed in as an admin
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  This is the client portal view. Head back to the admin
                  dashboard unless you&apos;re intentionally testing what a
                  client sees.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="cursor-pointer rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <Button variant="ghost" onClick={dismiss}>
                I&apos;m just testing
              </Button>
              <Link href="/admin/dashboard">
                <Button>
                  <LayoutDashboard size={14} aria-hidden />
                  Back to admin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Persistent floating pill — fixed to the bottom-left, sits above
          the Nerd card without touching the sidebar internals. z-index is
          below the modal (z-90) but above page content. */}
      <div className="pointer-events-none fixed bottom-20 left-3 z-40 lg:left-4">
        <Link
          href="/admin/dashboard"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-sm backdrop-blur transition-colors hover:border-amber-500/50 hover:bg-amber-500/20"
          title="Return to admin dashboard"
        >
          <LayoutDashboard size={12} aria-hidden />
          Back to admin
        </Link>
      </div>
    </>
  );
}
