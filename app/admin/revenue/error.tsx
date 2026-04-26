'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function RevenueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Revenue page error:', error);
  }, [error]);

  return (
    <PageError
      title="Couldn't load revenue"
      description="The Stripe sync may be slow or the API hit a temporary error. Try again — most retries succeed."
      reset={reset}
    />
  );
}
