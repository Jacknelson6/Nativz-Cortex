'use client';

// SPY-04 T24: fires the analytics ping when the public page mounts and
// reports time-on-page when the visitor leaves. Visibility-change is the
// only reliable beacon trigger across mobile + desktop.

import { useEffect, useRef } from 'react';

interface Props {
  token: string;
}

export function TrackView({ token }: Props) {
  const startedAt = useRef<number>(Date.now());
  const sentInitial = useRef<boolean>(false);

  useEffect(() => {
    if (sentInitial.current) return;
    sentInitial.current = true;
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    void fetch(`/api/shared/prospect/${token}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrer }),
      keepalive: true,
    }).catch(() => {
      // Swallow — analytics, not critical.
    });
  }, [token]);

  useEffect(() => {
    const onLeave = () => {
      const duration = Date.now() - startedAt.current;
      if (duration < 2000) return;
      try {
        navigator.sendBeacon?.(
          `/api/shared/prospect/${token}/views`,
          new Blob([JSON.stringify({ duration_ms: duration })], {
            type: 'application/json',
          }),
        );
      } catch {
        // noop
      }
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [token]);

  return null;
}
