import { NextRequest, NextResponse } from 'next/server';
import { recordCronRun } from './cron-runs';

type CronHandler = (req: NextRequest) => Promise<NextResponse | Response>;

interface CronTelemetryOptions {
  /** Route identifier — usually `/api/cron/<name>`. Appears in the Crons tab. */
  route: string;
  /**
   * Optional hook that inspects the NextResponse body to extract a
   * `rows_processed` count. Called only on success (non-error); never throws.
   */
  extractRowsProcessed?: (body: unknown) => number | undefined;
}

/**
 * Wrap a cron route handler so every invocation records a row in cron_runs.
 * The wrapper preserves the handler's response exactly — telemetry failures
 * are swallowed and logged. Non-2xx responses get status 'partial'; thrown
 * errors get status 'error'; otherwise 'ok'.
 */
export function withCronTelemetry(
  opts: CronTelemetryOptions,
  handler: CronHandler,
): CronHandler {
  return async (req: NextRequest) => {
    const startedAt = new Date();
    try {
      const response = await handler(req);
      const status: 'ok' | 'partial' = response.status >= 400 ? 'partial' : 'ok';

      let rowsProcessed: number | undefined;
      if (opts.extractRowsProcessed) {
        try {
          // Clone so we don't consume the response body downstream.
          const clone = response.clone();
          const body = await clone.json().catch(() => null);
          rowsProcessed = opts.extractRowsProcessed(body);
        } catch {
          /* ignore — telemetry is best-effort */
        }
      }

      await recordCronRun({
        route: opts.route,
        status,
        startedAt,
        rowsProcessed,
        metadata: { http_status: response.status },
      });

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordCronRun({
        route: opts.route,
        status: 'error',
        startedAt,
        error: message,
      });
      throw err;
    }
  };
}
