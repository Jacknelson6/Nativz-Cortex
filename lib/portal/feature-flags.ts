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

export function buildPortalFeatureFlags(raw: unknown): FeatureFlags {
  return { ...PORTAL_FEATURE_FLAG_DEFAULTS, ...(raw as Partial<FeatureFlags> ?? {}) };
}
