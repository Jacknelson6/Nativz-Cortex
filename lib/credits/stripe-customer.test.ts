import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const stripeCreateMock = vi.fn();
const getStripeMock = vi.fn((_brand: string) => ({
  customers: { create: stripeCreateMock },
}));
const getBrandFromAgencyMock = vi.fn((_agency: string | null | undefined) => 'nativz' as 'nativz' | 'anderson');

vi.mock('@/lib/stripe/client', () => ({
  getStripe: (brand: string) => getStripeMock(brand),
}));
vi.mock('@/lib/agency/detect', () => ({
  getBrandFromAgency: (agency: string | null | undefined) =>
    getBrandFromAgencyMock(agency),
}));

import { ensureStripeCustomer } from './stripe-customer';

interface ClientLookupResult {
  data: {
    id: string;
    name: string | null;
    agency: string | null;
    stripe_customer_id: string | null;
    organization_id: string | null;
  } | null;
  error: { message: string } | null;
}

interface ClaimResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

interface RefreshResult {
  data: { stripe_customer_id: string | null } | null;
  error: { message: string } | null;
}

/**
 * The helper makes up to three supabase calls in a fixed order:
 *   1. clients lookup (select+eq+maybeSingle)
 *   2. clients claim update (update+eq+is+select+maybeSingle)
 *   3. (race-lost only) clients refresh (select+eq+maybeSingle)
 * This factory lets each test stage exactly the responses it needs.
 */
function makeAdmin(opts: {
  lookup: ClientLookupResult;
  claim?: ClaimResult;
  refresh?: RefreshResult;
}): { admin: SupabaseClient; calls: { from: ReturnType<typeof vi.fn> } } {
  let clientsCallCount = 0;

  const fromMock = vi.fn((table: string) => {
    if (table !== 'clients') throw new Error(`unexpected table: ${table}`);
    clientsCallCount += 1;

    if (clientsCallCount === 1) {
      // Lookup chain.
      const maybeSingle = vi.fn(async () => opts.lookup);
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }
    if (clientsCallCount === 2) {
      // Claim chain: update().eq().is().select().maybeSingle()
      const maybeSingle = vi.fn(async () => opts.claim ?? { data: { id: 'client-1' }, error: null });
      const select = vi.fn(() => ({ maybeSingle }));
      const is = vi.fn(() => ({ select }));
      const eq = vi.fn(() => ({ is }));
      const update = vi.fn(() => ({ eq }));
      return { update };
    }
    if (clientsCallCount === 3) {
      // Refresh chain: select().eq().maybeSingle()
      const maybeSingle = vi.fn(async () => opts.refresh ?? { data: null, error: null });
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }
    throw new Error(`unexpected clients call #${clientsCallCount}`);
  });

  const admin = { from: fromMock } as unknown as SupabaseClient;
  return { admin, calls: { from: fromMock } };
}

beforeEach(() => {
  stripeCreateMock.mockReset();
  getStripeMock.mockClear();
  getBrandFromAgencyMock.mockReset();
  // Default: nativz brand. Tests override per-case.
  getBrandFromAgencyMock.mockReturnValue('nativz');
});

describe('ensureStripeCustomer', () => {
  it('returns the existing customer id without calling Stripe when one is already set', async () => {
    const { admin, calls } = makeAdmin({
      lookup: {
        data: {
          id: 'client-1',
          name: 'Acme',
          agency: 'nativz',
          stripe_customer_id: 'cus_existing',
          organization_id: 'org-1',
        },
        error: null,
      },
    });

    const result = await ensureStripeCustomer(admin, 'client-1', 'a@b.com');

    expect(result).toEqual({
      stripeCustomerId: 'cus_existing',
      created: false,
      agency: 'nativz',
    });
    expect(stripeCreateMock).not.toHaveBeenCalled();
    expect(calls.from).toHaveBeenCalledTimes(1);
    expect(calls.from).toHaveBeenCalledWith('clients');
  });

  it('routes through the agency-correct Stripe account', async () => {
    getBrandFromAgencyMock.mockReturnValueOnce('anderson');
    const { admin } = makeAdmin({
      lookup: {
        data: {
          id: 'client-2',
          name: 'AC client',
          agency: 'Anderson Collaborative',
          stripe_customer_id: null,
          organization_id: 'org-9',
        },
        error: null,
      },
    });
    stripeCreateMock.mockResolvedValueOnce({
      id: 'cus_new',
      email: 'a@b.com',
      name: 'AC client',
      metadata: {},
      livemode: false,
      created: 1700000000,
    });

    const result = await ensureStripeCustomer(admin, 'client-2', 'a@b.com');

    expect(getStripeMock).toHaveBeenCalledWith('anderson');
    expect(result.agency).toBe('anderson');
    expect(result.created).toBe(true);
  });

  it('creates a new Stripe customer and persists it back to the clients row', async () => {
    const { admin } = makeAdmin({
      lookup: {
        data: {
          id: 'client-1',
          name: 'Acme',
          agency: 'nativz',
          stripe_customer_id: null,
          organization_id: 'org-1',
        },
        error: null,
      },
    });
    stripeCreateMock.mockResolvedValueOnce({
      id: 'cus_brand_new',
      email: 'jane@acme.com',
      name: 'Acme',
      metadata: { client_id: 'client-1', organization_id: 'org-1' },
      livemode: false,
      created: 1700000000,
    });

    const result = await ensureStripeCustomer(admin, 'client-1', 'jane@acme.com');

    expect(result).toEqual({
      stripeCustomerId: 'cus_brand_new',
      created: true,
      agency: 'nativz',
    });
    expect(stripeCreateMock).toHaveBeenCalledWith({
      email: 'jane@acme.com',
      name: 'Acme',
      metadata: {
        client_id: 'client-1',
        organization_id: 'org-1',
        cortex_source: 'credits.checkout',
      },
    });
  });

  it('uses an empty string for organization_id when the client row has none', async () => {
    const { admin } = makeAdmin({
      lookup: {
        data: {
          id: 'client-7',
          name: 'Solo',
          agency: 'nativz',
          stripe_customer_id: null,
          organization_id: null,
        },
        error: null,
      },
    });
    stripeCreateMock.mockResolvedValueOnce({
      id: 'cus_solo',
      email: 'solo@x.com',
      name: 'Solo',
      metadata: {},
      livemode: false,
      created: 1700000000,
    });

    await ensureStripeCustomer(admin, 'client-7', 'solo@x.com');

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ organization_id: '' }),
      }),
    );
  });

  it('returns the winners customer id when the conditional update loses the race', async () => {
    const { admin } = makeAdmin({
      lookup: {
        data: {
          id: 'client-1',
          name: 'Acme',
          agency: 'nativz',
          stripe_customer_id: null,
          organization_id: 'org-1',
        },
        error: null,
      },
      claim: { data: null, error: null }, // race lost
      refresh: { data: { stripe_customer_id: 'cus_winner' }, error: null },
    });
    stripeCreateMock.mockResolvedValueOnce({
      id: 'cus_loser',
      email: 'a@b.com',
      name: 'Acme',
      metadata: {},
      livemode: false,
      created: 1700000000,
    });

    const result = await ensureStripeCustomer(admin, 'client-1', 'a@b.com');

    expect(result).toEqual({
      stripeCustomerId: 'cus_winner',
      created: false,
      agency: 'nativz',
    });
  });

  it('throws when the row vanishes mid-flight (race lost AND no winner persisted)', async () => {
    const { admin } = makeAdmin({
      lookup: {
        data: {
          id: 'client-1',
          name: 'Acme',
          agency: 'nativz',
          stripe_customer_id: null,
          organization_id: 'org-1',
        },
        error: null,
      },
      claim: { data: null, error: null },
      refresh: { data: null, error: null },
    });
    stripeCreateMock.mockResolvedValueOnce({
      id: 'cus_orphan',
      email: 'a@b.com',
      name: 'Acme',
      metadata: {},
      livemode: false,
      created: 1700000000,
    });

    await expect(
      ensureStripeCustomer(admin, 'client-1', 'a@b.com'),
    ).rejects.toThrow(/disappeared during update/);
  });

  it('throws when the clients lookup returns an error', async () => {
    const { admin } = makeAdmin({
      lookup: { data: null, error: { message: 'connection refused' } },
    });
    await expect(
      ensureStripeCustomer(admin, 'client-1', 'a@b.com'),
    ).rejects.toThrow(/connection refused/);
    expect(stripeCreateMock).not.toHaveBeenCalled();
  });

  it('throws when the client row is missing', async () => {
    const { admin } = makeAdmin({
      lookup: { data: null, error: null },
    });
    await expect(
      ensureStripeCustomer(admin, 'missing-client', 'a@b.com'),
    ).rejects.toThrow(/no client missing-client/);
    expect(stripeCreateMock).not.toHaveBeenCalled();
  });
});
