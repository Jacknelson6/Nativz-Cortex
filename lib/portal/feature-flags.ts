/**
 * Portal feature flags stored on `clients.feature_flags` (jsonb).
 * Merged with defaults so partial PATCHes cannot wipe keys.
 */

export interface FeatureFlags {
  can_search: boolean;
  can_view_reports: boolean;
  can_edit_preferences: boolean;
  can_submit_ideas: boolean;
  can_view_notifications: boolean;
  can_view_calendar: boolean;
  can_view_analyze: boolean;
  can_view_knowledge: boolean;
  can_use_nerd: boolean;
  /** When false, portal users for this client cannot create or use REST API keys (Bearer /api/v1). */
  can_use_api: boolean;
}

export const PORTAL_FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  can_search: true,
  can_view_reports: true,
  can_edit_preferences: true,
  can_submit_ideas: true,
  can_view_notifications: true,
  can_view_calendar: false,
  can_view_analyze: false,
  can_view_knowledge: true,
  can_use_nerd: true,
  can_use_api: true,
};

/**
 * Portal-facing catalogue of "tools" — items that render in the portal
 * sidebar and can be enabled/disabled per client. Items not in this list
 * are unconditional (e.g. Research, Settings). Each entry's `tooltip`
 * shows when the item is disabled: "coming_soon" = on the roadmap,
 * "ask_team" = gated by per-client access. Admin is expected to flip
 * the flag from the client's settings page when a brand is onboarded.
 */
export interface PortalTool {
  key: keyof FeatureFlags;
  label: string;
  href: string;
  /** Disabled-state copy variant. */
  tooltip: 'coming_soon' | 'ask_team';
}

export const PORTAL_TOOLS: PortalTool[] = [];

export function portalToolTooltipText(variant: PortalTool['tooltip']): string {
  return variant === 'coming_soon'
    ? 'Coming soon'
    : 'Ask your team to enable this feature for you';
}

export function buildPortalFeatureFlags(raw: unknown): FeatureFlags {
  return { ...PORTAL_FEATURE_FLAG_DEFAULTS, ...(raw as Partial<FeatureFlags> ?? {}) };
}
