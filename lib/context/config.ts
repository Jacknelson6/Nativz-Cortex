import type { ContextPlatformConfig, ContextPlatformMode, ContextPlatformScope } from '@/lib/context/types';

function parseMode(raw: string | undefined): ContextPlatformMode {
  const v = (raw ?? 'off').toLowerCase().trim();
  if (v === 'shadow' || v === 'primary' || v === 'off') return v;
  return 'off';
}

function parseScope(raw: string | undefined): ContextPlatformScope {
  const v = (raw ?? 'both').toLowerCase().trim();
  if (v === 'client' || v === 'agency' || v === 'both') return v;
  return 'both';
}

/**
 * Env-driven context platform configuration (TrustGraph parallel-run / cutover).
 *
 * - CONTEXT_PLATFORM_MODE: off | shadow | primary
 * - CONTEXT_PLATFORM_SCOPE: client | agency | both
 * - TRUSTGRAPH_BASE_URL: gateway base URL (required for non-off modes)
 * - TRUSTGRAPH_API_KEY: optional Bearer token for gateway
 * - TRUSTGRAPH_TIMEOUT_MS: HTTP timeout (default 12000)
 * - TRUSTGRAPH_CIRCUIT_FAILURES: failures before circuit opens (default 5)
 * - TRUSTGRAPH_CIRCUIT_OPEN_MS: how long circuit stays open (default 60000)
 */
export function getContextPlatformConfig(): ContextPlatformConfig {
  const baseUrl = process.env.TRUSTGRAPH_BASE_URL?.replace(/\/$/, '') ?? null;
  const mode = parseMode(process.env.CONTEXT_PLATFORM_MODE);
  const trustgraphEnabled = mode !== 'off' && !!baseUrl;

  return {
    mode,
    scope: parseScope(process.env.CONTEXT_PLATFORM_SCOPE),
    baseUrl: trustgraphEnabled ? baseUrl : null,
    apiKey: process.env.TRUSTGRAPH_API_KEY?.trim() || null,
    timeoutMs: Math.max(1000, Number(process.env.TRUSTGRAPH_TIMEOUT_MS) || 12_000),
    circuitFailureThreshold: Math.max(1, Number(process.env.TRUSTGRAPH_CIRCUIT_FAILURES) || 5),
    circuitOpenMs: Math.max(1000, Number(process.env.TRUSTGRAPH_CIRCUIT_OPEN_MS) || 60_000),
  };
}

export function scopeIncludesClient(scope: ContextPlatformScope): boolean {
  return scope === 'client' || scope === 'both';
}

export function scopeIncludesAgency(scope: ContextPlatformScope): boolean {
  return scope === 'agency' || scope === 'both';
}
