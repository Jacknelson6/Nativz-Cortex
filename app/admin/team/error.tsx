'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function TeamError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Team page error:', error);
  }, [error]);

  return <PageError title="Couldn't load team" description="Something went wrong loading team members. Check your connection and try again." />;
}
