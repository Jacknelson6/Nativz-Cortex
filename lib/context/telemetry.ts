import type { ParityLogPayload } from '@/lib/context/types';

/**
 * Structured parity logging for TrustGraph shadow runs (Vercel / server logs).
 */
export function logContextParity(payload: ParityLogPayload): void {
  const line = JSON.stringify({
    event: 'context_platform_parity',
    ...payload,
    ts: new Date().toISOString(),
  });
  console.info(line);
}

export function logContextPlatformError(surface: 'client' | 'agency', message: string, extra?: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      event: 'context_platform_error',
      surface,
      message,
      ...extra,
      ts: new Date().toISOString(),
    }),
  );
}
