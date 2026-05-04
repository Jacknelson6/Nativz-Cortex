import { describe, expect, it } from 'vitest';
import {
  PORTAL_FEATURE_FLAG_DEFAULTS,
  PORTAL_TOOLS,
  buildPortalFeatureFlags,
  portalToolTooltipText,
  type FeatureFlags,
} from './feature-flags';

/**
 * feature-flags is the source of truth for which portal surfaces a given
 * client may use. Two pieces under test:
 *
 *   1. buildPortalFeatureFlags(raw) merges arbitrary jsonb from the
 *      `clients.feature_flags` column with PORTAL_FEATURE_FLAG_DEFAULTS.
 *      Critical invariant: a partial record cannot wipe a default key —
 *      e.g. if an admin saves only `{ can_use_api: false }` we still
 *      surface every other tool.
 *
 *   2. portalToolTooltipText returns the right disabled-state copy for
 *      "coming_soon" vs "ask_team" variants. Sidebar tooltips read this
 *      verbatim, so a regression here changes the user-facing copy.
 */

describe('PORTAL_FEATURE_FLAG_DEFAULTS', () => {
  it('exposes every key on FeatureFlags (no missing default)', () => {
    const keys: (keyof FeatureFlags)[] = [
      'can_search',
      'can_view_reports',
      'can_edit_preferences',
      'can_submit_ideas',
      'can_view_notifications',
      'can_view_calendar',
      'can_view_analyze',
      'can_view_knowledge',
      'can_use_nerd',
      'can_use_api',
    ];
    for (const k of keys) {
      expect(PORTAL_FEATURE_FLAG_DEFAULTS).toHaveProperty(k);
      expect(typeof PORTAL_FEATURE_FLAG_DEFAULTS[k]).toBe('boolean');
    }
  });

  it('defaults the GA-shipped surfaces to enabled', () => {
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_search).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_reports).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_edit_preferences).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_submit_ideas).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_notifications).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_knowledge).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_use_nerd).toBe(true);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_use_api).toBe(true);
  });

  it('keeps roadmap-only surfaces off by default', () => {
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_calendar).toBe(false);
    expect(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_analyze).toBe(false);
  });
});

describe('buildPortalFeatureFlags', () => {
  it('returns the defaults verbatim when raw is null', () => {
    expect(buildPortalFeatureFlags(null)).toEqual(PORTAL_FEATURE_FLAG_DEFAULTS);
  });

  it('returns the defaults when raw is undefined', () => {
    expect(buildPortalFeatureFlags(undefined)).toEqual(PORTAL_FEATURE_FLAG_DEFAULTS);
  });

  it('returns the defaults when raw is an empty object', () => {
    expect(buildPortalFeatureFlags({})).toEqual(PORTAL_FEATURE_FLAG_DEFAULTS);
  });

  it('overrides only the keys present in raw, preserving other defaults', () => {
    const merged = buildPortalFeatureFlags({ can_use_api: false });
    expect(merged.can_use_api).toBe(false);
    // Every other key matches the default.
    expect(merged.can_search).toBe(PORTAL_FEATURE_FLAG_DEFAULTS.can_search);
    expect(merged.can_view_reports).toBe(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_reports);
    expect(merged.can_view_calendar).toBe(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_calendar);
    expect(merged.can_view_knowledge).toBe(PORTAL_FEATURE_FLAG_DEFAULTS.can_view_knowledge);
  });

  it('honours raw when it flips a default-off key on', () => {
    const merged = buildPortalFeatureFlags({ can_view_calendar: true });
    expect(merged.can_view_calendar).toBe(true);
    expect(merged.can_view_analyze).toBe(false);
  });

  it('does not mutate PORTAL_FEATURE_FLAG_DEFAULTS', () => {
    const before = { ...PORTAL_FEATURE_FLAG_DEFAULTS };
    buildPortalFeatureFlags({ can_search: false });
    expect(PORTAL_FEATURE_FLAG_DEFAULTS).toEqual(before);
  });

  it('returns a fresh object on every call (no shared reference)', () => {
    const a = buildPortalFeatureFlags({});
    const b = buildPortalFeatureFlags({});
    expect(a).not.toBe(b);
    a.can_use_api = false;
    expect(b.can_use_api).toBe(true);
  });

});

describe('portalToolTooltipText', () => {
  it('returns the coming-soon copy', () => {
    expect(portalToolTooltipText('coming_soon')).toBe('Coming soon');
  });

  it('returns the ask-team copy', () => {
    expect(portalToolTooltipText('ask_team')).toBe(
      'Ask your team to enable this feature for you',
    );
  });
});

describe('PORTAL_TOOLS', () => {
  it('is currently an empty list (no portal-only sidebar tools yet)', () => {
    // The catalogue exists but ships empty until a tool needs per-client
    // gating in the sidebar. Snapshotting the shape here so future entries
    // get reviewed deliberately rather than slipping in.
    expect(Array.isArray(PORTAL_TOOLS)).toBe(true);
    expect(PORTAL_TOOLS).toEqual([]);
  });
});
