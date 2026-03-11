'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function TasksError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Tasks page error:', error);
  }, [error]);

  return <PageError title="Couldn't load tasks" description="Something went wrong loading the task board. Check your connection and try again." />;
}
