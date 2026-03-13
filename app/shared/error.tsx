'use client';

import { useEffect } from 'react';

export default function SharedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Shared link error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          Link expired or invalid
        </h1>
        <p className="text-text-muted">
          This shared link may have expired, been revoked, or doesn&apos;t exist.
          Check with the person who shared it.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
