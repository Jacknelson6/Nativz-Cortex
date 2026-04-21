'use client';

import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/swr/fetcher';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        revalidateIfStale: true,
        dedupingInterval: 30_000,
        keepPreviousData: true,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
