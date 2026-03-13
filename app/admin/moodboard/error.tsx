'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function MoodboardError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Moodboard page error:', error);
  }, [error]);

  return <PageError title="Couldn't load moodboard" description="Something went wrong loading the moodboard. Check your connection and try again." />;
}
