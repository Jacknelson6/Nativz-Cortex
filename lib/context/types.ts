/**
 * Context platform (TrustGraph + Supabase) types for Nerd retrieval.
 */

export type ContextPlatformMode = 'off' | 'shadow' | 'primary';

/** Which retrieval surfaces use the platform (TrustGraph) integration. */
export type ContextPlatformScope = 'client' | 'agency' | 'both';

export type ContextPlatformConfig = {
  mode: ContextPlatformMode;
  scope: ContextPlatformScope;
  /** Base URL for TrustGraph gateway (no trailing slash). */
  baseUrl: string | null;
  /** Optional API key for TrustGraph gateway. */
  apiKey: string | null;
  /** Request timeout in ms. */
  timeoutMs: number;
  /** Max consecutive failures before circuit opens (primary mode). */
  circuitFailureThreshold: number;
  /** Circuit open duration in ms. */
  circuitOpenMs: number;
};

export type ParityLogPayload = {
  surface: 'client' | 'agency';
  clientId?: string;
  query: string;
  primaryIds: string[];
  trustgraphIds: string[];
  overlapAt5: number;
  overlapAt10: number;
  primaryMs: number;
  trustgraphMs: number;
  trustgraphError?: string;
};
