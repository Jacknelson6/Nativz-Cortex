'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function ShootsError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Shoots page error:', error);
  }, [error]);

  return <PageError title="Couldn't load shoots" description="Something went wrong loading the content calendar. Check your connection and try again." />;
}
