/** Per-step OpenRouter timeout for Brand DNA pipeline (avoids hung fetches). */
export const BRAND_DNA_AI_TIMEOUT_MS = 180_000;

/** If a job is in-flight but the row has not been updated for this long, treat as stuck. */
export const BRAND_DNA_JOB_STALE_MS = 25 * 60 * 1000;

/** Job rows still running the pipeline (not terminal). */
export const BRAND_DNA_JOB_IN_FLIGHT_STATUSES = [
  'queued',
  'crawling',
  'extracting',
  'analyzing',
  'compiling',
] as const;

export function isBrandDnaJobInFlightStatus(status: string | null | undefined): boolean {
  return !!status && (BRAND_DNA_JOB_IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}
