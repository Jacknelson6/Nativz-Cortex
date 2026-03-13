'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function AnalyticsError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Analytics page error:', error);
  }, [error]);

  return <PageError title="Couldn't load analytics" description="Something went wrong loading analytics. Check your connection and try again." />;
}
