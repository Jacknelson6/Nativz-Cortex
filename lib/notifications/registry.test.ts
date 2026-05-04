import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_REGISTRY,
  getNotificationDefinition,
  type NotificationDefinition,
} from './registry';

/**
 * `lib/notifications/registry.ts` is the single source of truth for every
 * automated notification Cortex sends. The admin Notifications UI joins this
 * list against the `notification_settings` DB table; senders look up an entry
 * by `key` and bail when disabled. Three contracts to pin:
 *
 *   1. Every `key` is unique. The DB join is keyed on `key`, and the admin
 *      UI renders one row per registry entry. A duplicate would cause the
 *      second entry to silently shadow the first in the UI map and leave
 *      one of the senders permanently un-toggleable.
 *
 *   2. `cron` entries declare BOTH `cronSchedule` and `cronPath`; `event`
 *      entries declare NEITHER. The cronPath is what the admin "Open the
 *      cron" link points to, and the cronSchedule is the read-only display
 *      of when it fires. A cron entry without a path strands the operator
 *      with no way to inspect the runtime; an event entry with cron metadata
 *      is meaningless and confuses the schedule column.
 *
 *   3. Param specs are internally consistent — the `default` value matches
 *      the declared `type` discriminator, and for duration types the
 *      default sits within [min, max]. The admin UI renders these as numeric
 *      knobs and clamps to min/max; a default outside the range would render
 *      a control whose initial value the slider can't reach.
 *
 * `getNotificationDefinition` is the lookup helper used by the admin UI and
 * settings resolver. Defensive contract: returns null (not undefined) for
 * unknown keys so callers can `?? defaults` cleanly.
 */

describe('NOTIFICATION_REGISTRY — uniqueness & shape', () => {
  it('contains at least one entry (regression: empty registry breaks the admin Notifications page)', () => {
    expect(NOTIFICATION_REGISTRY.length).toBeGreaterThan(0);
  });

  it('every key is unique (no duplicates would shadow each other in the DB join)', () => {
    const keys = NOTIFICATION_REGISTRY.map((n) => n.key);
    const uniq = new Set(keys);
    expect(uniq.size).toBe(keys.length);
  });

  it('every key is a non-empty stable identifier (snake_case so DB rows stay readable)', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      expect(def.key.length).toBeGreaterThan(0);
      expect(def.key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('every entry has a populated label and description (admin UI renders both)', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a populated recipientLabel (the "Who gets this?" column)', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      expect(def.recipientLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('NOTIFICATION_REGISTRY — kind discriminator', () => {
  const allowed: ReadonlyArray<NotificationDefinition['kind']> = ['email', 'chat', 'in_app'];

  it('every kind is one of email | chat | in_app', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      expect(allowed).toContain(def.kind);
    }
  });
});

describe('NOTIFICATION_REGISTRY — cron vs event metadata', () => {
  it('every cron entry declares both cronSchedule and cronPath', () => {
    // Pin: a cron entry without a path would render no "Open the cron"
    // affordance in the admin UI, leaving operators without a way to
    // inspect or trigger the route.
    for (const def of NOTIFICATION_REGISTRY) {
      if (def.trigger === 'cron') {
        expect(def.cronSchedule, `${def.key} missing cronSchedule`).toBeDefined();
        expect(def.cronPath, `${def.key} missing cronPath`).toBeDefined();
      }
    }
  });

  it('every event entry declares NEITHER cronSchedule NOR cronPath', () => {
    // Pin: cron metadata on an event-triggered notification is misleading —
    // the admin UI would render a schedule that never fires.
    for (const def of NOTIFICATION_REGISTRY) {
      if (def.trigger === 'event') {
        expect(def.cronSchedule, `${def.key} should not have cronSchedule`).toBeUndefined();
        expect(def.cronPath, `${def.key} should not have cronPath`).toBeUndefined();
      }
    }
  });

  it('every cronPath starts with /api/cron/ (Vercel cron convention)', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      if (def.cronPath) {
        expect(def.cronPath, `${def.key}`).toMatch(/^\/api\/cron\//);
      }
    }
  });

  it('every cronSchedule is a 5-field cron expression', () => {
    // Pin: Vercel rejects any other shape. If the schedule is bad, the cron
    // never fires and we silently lose the notification.
    for (const def of NOTIFICATION_REGISTRY) {
      if (def.cronSchedule) {
        const fields = def.cronSchedule.split(/\s+/);
        expect(fields.length, `${def.key} schedule="${def.cronSchedule}"`).toBe(5);
      }
    }
  });

  it('every trigger is one of cron | event', () => {
    const allowed: ReadonlyArray<NotificationDefinition['trigger']> = ['cron', 'event'];
    for (const def of NOTIFICATION_REGISTRY) {
      expect(allowed).toContain(def.trigger);
    }
  });
});

describe('NOTIFICATION_REGISTRY — param specs', () => {
  const numericTypes = ['duration_hours', 'duration_minutes'];

  it('every param spec declares a valid type discriminator', () => {
    const allowed = ['duration_hours', 'duration_minutes', 'string', 'boolean', 'email_list'];
    for (const def of NOTIFICATION_REGISTRY) {
      if (!def.params) continue;
      for (const [paramKey, spec] of Object.entries(def.params)) {
        expect(allowed, `${def.key}.${paramKey}`).toContain(spec.type);
      }
    }
  });

  it('every param spec has a non-empty label', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      if (!def.params) continue;
      for (const [paramKey, spec] of Object.entries(def.params)) {
        expect(spec.label.length, `${def.key}.${paramKey}`).toBeGreaterThan(0);
      }
    }
  });

  it('numeric param defaults match their declared type', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      if (!def.params) continue;
      for (const [paramKey, spec] of Object.entries(def.params)) {
        if (numericTypes.includes(spec.type)) {
          expect(typeof spec.default, `${def.key}.${paramKey}`).toBe('number');
        }
        if (spec.type === 'string') {
          expect(typeof spec.default, `${def.key}.${paramKey}`).toBe('string');
        }
        if (spec.type === 'boolean') {
          expect(typeof spec.default, `${def.key}.${paramKey}`).toBe('boolean');
        }
        if (spec.type === 'email_list') {
          expect(Array.isArray(spec.default), `${def.key}.${paramKey}`).toBe(true);
        }
      }
    }
  });

  it('duration default sits within [min, max] when both are set', () => {
    // Pin: the admin UI clamps the slider to min/max. A default outside the
    // range would render a control whose displayed value the slider can't
    // reach, so saving (no edit) would silently snap.
    for (const def of NOTIFICATION_REGISTRY) {
      if (!def.params) continue;
      for (const [paramKey, spec] of Object.entries(def.params)) {
        if (!numericTypes.includes(spec.type)) continue;
        if (spec.min === undefined || spec.max === undefined) continue;
        const dflt = spec.default as number;
        expect(dflt, `${def.key}.${paramKey} default below min`).toBeGreaterThanOrEqual(spec.min);
        expect(dflt, `${def.key}.${paramKey} default above max`).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  it('numeric min is less than or equal to max when both are set', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      if (!def.params) continue;
      for (const [paramKey, spec] of Object.entries(def.params)) {
        if (spec.min !== undefined && spec.max !== undefined) {
          expect(spec.min, `${def.key}.${paramKey}`).toBeLessThanOrEqual(spec.max);
        }
      }
    }
  });
});

describe('getNotificationDefinition', () => {
  it('returns the matching definition for a known key', () => {
    const first = NOTIFICATION_REGISTRY[0];
    expect(getNotificationDefinition(first.key)).toBe(first);
  });

  it('returns null (not undefined) for an unknown key', () => {
    // Pin: the helper is typed to return `NotificationDefinition | null`, and
    // callers do `?? defaults`. A regression that returned undefined would
    // type-check (because the union is wider than declared) and would only
    // surface as a runtime nullish-coalesce miss.
    const result = getNotificationDefinition('does-not-exist');
    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  it('returns null for an empty string', () => {
    expect(getNotificationDefinition('')).toBeNull();
  });

  it('is case-sensitive (keys are stable identifiers, not labels)', () => {
    // Pin: a future "tolerant" toLowerCase() match would couple the lookup
    // to humans typing the right case in URL/admin input, but the key is
    // a programmatic identifier — case-sensitivity matches the DB column.
    const first = NOTIFICATION_REGISTRY[0];
    const upper = first.key.toUpperCase();
    if (upper !== first.key) {
      expect(getNotificationDefinition(upper)).toBeNull();
    }
  });

  it('finds every registered key (round-trip consistency)', () => {
    for (const def of NOTIFICATION_REGISTRY) {
      expect(getNotificationDefinition(def.key)).toBe(def);
    }
  });
});

describe('NOTIFICATION_REGISTRY — known anchor entries', () => {
  // Light pin on a couple of load-bearing entries so a rename is visible
  // in the test diff. Senders import these keys as string literals.
  it('still includes calendar_comment_digest (drives the daily review email)', () => {
    expect(getNotificationDefinition('calendar_comment_digest')).not.toBeNull();
  });

  it('still includes topic_search_notify (drives the async search-ready email)', () => {
    expect(getNotificationDefinition('topic_search_notify')).not.toBeNull();
  });

  it('still includes onboarding_flow_reminders (drives the stalled-step nudge)', () => {
    expect(getNotificationDefinition('onboarding_flow_reminders')).not.toBeNull();
  });
});
