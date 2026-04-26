'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function SalesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Sales page error:', error);
  }, [error]);

  return (
    <PageError
      title="Couldn't load the sales pipeline"
      description="Something went wrong loading proposals or onboarding flows. Check your connection and try again."
      reset={reset}
    />
  );
}
