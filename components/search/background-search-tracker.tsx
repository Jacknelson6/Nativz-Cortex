'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface BackgroundSearch {
  id: string;
  query: string;
  redirectPrefix: string;
}

interface BackgroundSearchContextValue {
  /** Register a search to track in the background */
  track: (search: BackgroundSearch) => void;
  /** Stop tracking a search (e.g., user returned to it) */
  untrack: (searchId: string) => void;
  /** Currently tracked search IDs */
  trackedIds: string[];
}

const BackgroundSearchContext = createContext<BackgroundSearchContextValue>({
  track: () => {},
  untrack: () => {},
  trackedIds: [],
});

export function useBackgroundSearch() {
  return useContext(BackgroundSearchContext);
}

const POLL_INTERVAL = 5000;

export function BackgroundSearchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [tracked, setTracked] = useState<Map<string, BackgroundSearch>>(new Map());
  const trackedRef = useRef(tracked);
  trackedRef.current = tracked;

  const track = useCallback((search: BackgroundSearch) => {
    setTracked(prev => {
      const next = new Map(prev);
      next.set(search.id, search);
      return next;
    });
  }, []);

  const untrack = useCallback((searchId: string) => {
    setTracked(prev => {
      const next = new Map(prev);
      next.delete(searchId);
      return next;
    });
  }, []);

  // Poll tracked searches
  useEffect(() => {
    if (tracked.size === 0) return;

    const interval = setInterval(async () => {
      const current = trackedRef.current;
      for (const [id, search] of current) {
        try {
          const res = await fetch(`/api/search/${id}`);
          if (!res.ok) continue;
          const data = await res.json();

          if (data.status === 'completed') {
            // Remove from tracking
            setTracked(prev => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });

            // Show toast with action to navigate to results
            toast.success(`Research complete: "${search.query}"`, {
              duration: 10000,
              action: {
                label: 'View results',
                onClick: () => router.push(`${search.redirectPrefix}/search/${id}`),
              },
            });
          } else if (data.status === 'failed') {
            setTracked(prev => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
            toast.error(`Research failed: "${search.query}"`);
          }
        } catch {
          // Ignore fetch errors — will retry next interval
        }
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [tracked.size, router]);

  return (
    <BackgroundSearchContext.Provider value={{
      track,
      untrack,
      trackedIds: Array.from(tracked.keys()),
    }}>
      {children}
    </BackgroundSearchContext.Provider>
  );
}
