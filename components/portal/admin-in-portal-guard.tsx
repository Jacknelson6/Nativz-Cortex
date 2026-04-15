'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldAlert, ArrowRight, LayoutDashboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';

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
  const { brand: agencyBrand } = useAgencyBrand();
  const isAnderson = agencyBrand === 'anderson';

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
          <div className="relative w-full max-w-md rounded-2xl border border-nativz-border bg-surface px-6 py-7 shadow-elevated">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-3 top-3 cursor-pointer rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                <ShieldAlert size={20} />
              </div>
              <h2 className="text-base font-semibold text-text-primary">
                You&apos;re signed in as an admin
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                This is the client portal view. Head back to the admin
                dashboard unless you&apos;re intentionally testing what a
                client sees.
              </p>

              <div className="mt-6 flex w-full flex-col items-center gap-3">
                <Link href="/admin/dashboard" className="w-full max-w-xs">
                  <Button className="w-full">
                    Back to admin dashboard
                    <ArrowRight size={14} aria-hidden />
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={dismiss}
                  className="cursor-pointer text-xs text-text-muted transition-colors hover:text-text-secondary"
                >
                  I&apos;m just testing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent floating pill — centered at the top so it reads on
          either brand. Below the modal (z-90) but above the page header.
          Brand-colored so the AC light surface doesn't swallow it the way
          the old amber-on-white version did. */}
      <div className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2">
        <Link
          href="/admin/dashboard"
          className={
            isAnderson
              ? 'pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[#0a2340] px-3.5 py-1.5 text-xs font-semibold text-white ring-1 ring-[#0a2340]/30 shadow-md transition-colors hover:bg-[#143a63] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0a2340]'
              : 'pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-black shadow-md transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2'
          }
          title="Return to admin dashboard"
        >
          <LayoutDashboard size={12} aria-hidden />
          Back to admin
        </Link>
      </div>
    </>
  );
}
