'use client';

import { useEffect } from 'react';
import { PageError } from '@/components/shared/page-error';

export default function ProposalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Proposals page error:', error);
  }, [error]);

  return (
    <PageError
      title="Couldn't load this proposal"
      description="The editor or the public proposal endpoint hit an error. Try again, or open /admin/sales to see the broader pipeline."
      reset={reset}
    />
  );
}
