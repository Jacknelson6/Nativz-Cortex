'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function CalendarError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Calendar page error:', error);
  }, [error]);

  return <PageError title="Couldn't load calendar" description="Something went wrong loading the calendar. Check your connection and try again." />;
}
