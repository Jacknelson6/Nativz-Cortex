'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PageErrorProps {
  title?: string;
  description?: string;
  /**
   * Next.js error boundaries expose a `reset` callback that re-renders
   * the boundary's children. Pass it here so "Try again" actually
   * retries the failed render rather than just doing a full router
   * refresh. When omitted, we fall back to `router.refresh()` so the
   * component stays usable as a generic error surface.
   */
  reset?: () => void;
}

export function PageError({
  title = 'Something went wrong',
  description = "We couldn't load this page. Check your connection and try again.",
  reset,
}: PageErrorProps) {
  const router = useRouter();

  return (
    <div role="alert" className="flex items-center justify-center p-6 pt-24">
      <Card className="max-w-md text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15"
        >
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <p className="mt-2 text-sm text-text-muted">{description}</p>
        <div className="mt-6">
          <Button variant="outline" onClick={() => (reset ? reset() : router.refresh())}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
