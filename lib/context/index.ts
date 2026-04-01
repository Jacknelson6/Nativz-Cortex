/**
 * Context platform (TrustGraph + Supabase) — public exports for tooling and tests.
 */

export { getContextPlatformConfig, scopeIncludesAgency, scopeIncludesClient } from '@/lib/context/config';
export { runClientSearch } from '@/lib/context/run-client-search';
export { runAgencySearch } from '@/lib/context/run-agency-search';
export type { ContextPlatformConfig, ContextPlatformMode, ContextPlatformScope } from '@/lib/context/types';
