import { describe, expect, it } from 'vitest';
import { resolveAgencyFromHookPayload } from './resolve-agency';

/**
 * resolveAgencyFromHookPayload runs at the top of every Supabase auth
 * webhook (signup, password recovery, email change, magic link). The
 * brand it returns drives which logo, sender, footer, and theme go out
 * in the resulting transactional email — getting it wrong means an AC
 * client receives a Nativz-branded reset link, or vice versa.
 *
 * Priority chain under test:
 *   1. user_metadata.agency, when set to a known slug, wins outright.
 *   2. data.email_address_change hostname (the new address on
 *      email_change events) — only honoured when it resolves to a
 *      non-nativz brand, so a nativz hostname here doesn't mask a
 *      later signal.
 *   3. payload.email hostname — same "only if non-nativz" rule.
 *   4. Fallback: 'nativz'.
 */

describe('resolveAgencyFromHookPayload — user_metadata wins', () => {
  it('returns "anderson" when user_metadata.agency is "anderson"', async () => {
    const out = await resolveAgencyFromHookPayload({
      user_metadata: { agency: 'anderson' },
      email: 'someone@nativz.io',
    });
    expect(out).toBe('anderson');
  });

  it('returns "nativz" when user_metadata.agency is "nativz", even if email is on AC', async () => {
    const out = await resolveAgencyFromHookPayload({
      user_metadata: { agency: 'nativz' },
      email: 'someone@andersoncollaborative.com',
    });
    expect(out).toBe('nativz');
  });

  it('ignores unknown user_metadata.agency values and falls through', async () => {
    const out = await resolveAgencyFromHookPayload({
      user_metadata: { agency: 'mystery-shop' },
      email: 'someone@andersoncollaborative.com',
    });
    expect(out).toBe('anderson');
  });

  it('ignores non-string user_metadata.agency and falls through', async () => {
    const out = await resolveAgencyFromHookPayload({
      user_metadata: { agency: 42 },
      email: 'someone@andersoncollaborative.com',
    });
    expect(out).toBe('anderson');
  });
});

describe('resolveAgencyFromHookPayload — email_address_change branch', () => {
  it('honours an AC hostname on email_address_change over a nativz fallback email', async () => {
    const out = await resolveAgencyFromHookPayload({
      data: { email_address_change: 'new@andersoncollaborative.com' },
      email: 'old@nativz.io',
    });
    expect(out).toBe('anderson');
  });

  it('ignores a nativz email_address_change so the email branch can still run', async () => {
    const out = await resolveAgencyFromHookPayload({
      data: { email_address_change: 'new@nativz.io' },
      email: 'old@andersoncollaborative.com',
    });
    expect(out).toBe('anderson');
  });

  it('returns "nativz" when email_address_change resolves to nativz and no other signal exists', async () => {
    const out = await resolveAgencyFromHookPayload({
      data: { email_address_change: 'new@nativz.io' },
    });
    expect(out).toBe('nativz');
  });
});

describe('resolveAgencyFromHookPayload — email hostname fallback', () => {
  it('returns "anderson" for an AC email when no metadata or email_change present', async () => {
    const out = await resolveAgencyFromHookPayload({
      email: 'someone@andersoncollaborative.com',
    });
    expect(out).toBe('anderson');
  });

  it('returns "nativz" for a nativz email', async () => {
    const out = await resolveAgencyFromHookPayload({
      email: 'someone@nativz.io',
    });
    expect(out).toBe('nativz');
  });

  it('returns "nativz" for an unrelated email domain', async () => {
    const out = await resolveAgencyFromHookPayload({
      email: 'someone@gmail.com',
    });
    expect(out).toBe('nativz');
  });

  it('handles a malformed email with no @ by falling through to nativz', async () => {
    const out = await resolveAgencyFromHookPayload({
      email: 'not-an-email',
    });
    expect(out).toBe('nativz');
  });
});

describe('resolveAgencyFromHookPayload — empty / missing payload', () => {
  it('returns "nativz" for an empty payload', async () => {
    expect(await resolveAgencyFromHookPayload({})).toBe('nativz');
  });

  it('returns "nativz" when user_metadata is present but empty', async () => {
    expect(await resolveAgencyFromHookPayload({ user_metadata: {} })).toBe('nativz');
  });

  it('returns "nativz" when data is present but has no email_address_change', async () => {
    expect(await resolveAgencyFromHookPayload({ data: {} })).toBe('nativz');
  });
});
