/**
 * Shared helpers for Playwright E2E (admin / portal full journeys).
 */

import type { APIRequestContext } from '@playwright/test';

export function isBenignConsoleMessage(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('favicon') ||
    t.includes('resizeobserver') ||
    t.includes('non-error promise rejection') ||
    t.includes('failed to load resource') ||
    t.includes('hydration') ||
    t.includes('warning:') ||
    t.includes('deprecated') ||
    // Third-party WebGL / canvas (e.g. graph libs) — uncaught in some browsers during teardown
    t.includes('blendfunc') ||
    // Next dev HMR can briefly surface parse errors while reconciling a hot edit
    (t.includes('module parse failed') && t.includes('already been declared'))
  );
}

export function filterCriticalConsoleErrors(errors: string[]): string[] {
  return errors.filter((e) => !isBenignConsoleMessage(e));
}

/** Uses the same cookies as `page` when called as `page.request`. */
export async function fetchJson<T>(request: APIRequestContext, path: string): Promise<T | null> {
  const res = await request.get(path);
  if (!res.ok()) return null;
  return (await res.json()) as T;
}
