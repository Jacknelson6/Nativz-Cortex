import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const getStripeMock = vi.fn((_brand: string) => ({
  paymentIntents: { retrieve: paymentIntentsRetrieveMock },
  charges: { retrieve: chargesRetrieveMock },
}));
const paymentIntentsRetrieveMock = vi.fn();
const chargesRetrieveMock = vi.fn();
const getBrandFromAgencyMock = vi.fn(
  (_agency: string | null | undefined) => 'nativz' as 'nativz' | 'anderson',
);
const grantCreditMock = vi.fn();
const expireCreditMock = vi.fn();
const getDeliverableTypeIdMock = vi.fn(
  (_admin: unknown, _slug: string) => Promise.resolve('type-edited-video'),
);
const getDeliverableTypeSlugMock = vi.fn(
  (_admin: unknown, _id: string) => Promise.resolve('edited_video' as const),
);
const sendAddonReceiptMock = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  getStripe: (brand: string) => getStripeMock(brand),
}));
vi.mock('@/lib/agency/detect', () => ({
  getBrandFromAgency: (agency: string | null | undefined) =>
    getBrandFromAgencyMock(agency),
}));
vi.mock('./grant', () => ({
  grantCredit: (admin: unknown, args: unknown) => grantCreditMock(admin, args),
  expireCredit: (admin: unknown, args: unknown) =>
    expireCreditMock(admin, args),
}));
vi.mock('@/lib/deliverables/types-cache', () => ({
  getDeliverableTypeId: (admin: unknown, slug: string) =>
    getDeliverableTypeIdMock(admin, slug),
  getDeliverableTypeSlug: (admin: unknown, id: string) =>
    getDeliverableTypeSlugMock(admin, id),
}));
vi.mock('@/lib/email/resend', () => ({
  sendDeliverableAddonReceiptEmail: (opts: unknown) => sendAddonReceiptMock(opts),
}));

import {
  onCreditsCheckoutCompleted,
  onCreditsChargeRefunded,
  onCreditsChargeDisputed,
} from './webhook';

interface ContactRow {
  name: string;
  email: string | null;
  role: string | null;
  is_primary: boolean | null;
}

/**
 * The credits webhook touches four tables, and which ones depend on the path.
 * This factory configures responses by table; the `from()` mock dispatches
 * to the matching stub. Tables not listed throw, so a test that exercises
 * an unexpected path fails loudly rather than silently no-opping.
 */
function makeAdmin(opts: {
  clients?: { name?: string | null; agency?: string | null } | null;
  contacts?: ContactRow[] | null;
  // For findCreditsGrantForCharge.
  grant?: {
    client_id: string;
    delta: number;
    deliverable_type_id: string;
  } | null;
  // Track whether a transaction insert (`failed_email_attempts`) ran.
  insertSpy?: ReturnType<typeof vi.fn>;
}): { admin: SupabaseClient; failedInsert: ReturnType<typeof vi.fn> } {
  const failedInsert = opts.insertSpy ?? vi.fn(async () => ({ error: null }));

  const fromMock = vi.fn((table: string) => {
    if (table === 'clients') {
      const maybeSingle = vi.fn(async () => ({
        data: opts.clients ?? null,
        error: null,
      }));
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }
    if (table === 'contacts') {
      // .select().eq().returns<...>()
      const returns = vi.fn(async () => ({
        data: opts.contacts ?? [],
        error: null,
      }));
      const eq = vi.fn(() => ({ returns }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }
    if (table === 'credit_transactions') {
      // .select().eq().eq().maybeSingle()
      const maybeSingle = vi.fn(async () => ({
        data: opts.grant ?? null,
        error: null,
      }));
      const eq2 = vi.fn(() => ({ maybeSingle }));
      const eq1 = vi.fn(() => ({ eq: eq2 }));
      const select = vi.fn(() => ({ eq: eq1 }));
      return { select };
    }
    if (table === 'failed_email_attempts') {
      return { insert: failedInsert };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  const admin = { from: fromMock } as unknown as SupabaseClient;
  return { admin, failedInsert };
}

function buildSession(over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    amount_total: 15000,
    payment_intent: 'pi_test_123',
    metadata: {
      kind: 'credits',
      client_id: 'client-1',
      addon_slug: 'extra_edited_video',
      quantity: '1',
    },
    ...over,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  paymentIntentsRetrieveMock.mockReset();
  chargesRetrieveMock.mockReset();
  getStripeMock.mockClear();
  getBrandFromAgencyMock.mockReset();
  getBrandFromAgencyMock.mockReturnValue('nativz');
  grantCreditMock.mockReset();
  expireCreditMock.mockReset();
  getDeliverableTypeIdMock.mockReset();
  getDeliverableTypeIdMock.mockResolvedValue('type-edited-video');
  getDeliverableTypeSlugMock.mockReset();
  getDeliverableTypeSlugMock.mockResolvedValue('edited_video');
  sendAddonReceiptMock.mockReset();
  sendAddonReceiptMock.mockResolvedValue({ ok: true });
  paymentIntentsRetrieveMock.mockResolvedValue({
    latest_charge: { receipt_url: 'https://stripe.com/receipts/r_1' },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('onCreditsCheckoutCompleted', () => {
  it('no-ops when client_id is missing from metadata', async () => {
    const { admin } = makeAdmin({});
    await onCreditsCheckoutCompleted(
      buildSession({ metadata: { kind: 'credits' } as Stripe.Metadata }),
      admin,
      'nativz',
    );
    expect(grantCreditMock).not.toHaveBeenCalled();
    expect(sendAddonReceiptMock).not.toHaveBeenCalled();
  });

  it('no-ops when addon metadata is missing entirely', async () => {
    const { admin } = makeAdmin({});
    await onCreditsCheckoutCompleted(
      buildSession({
        metadata: { kind: 'credits', client_id: 'client-1' } as Stripe.Metadata,
      }),
      admin,
      'nativz',
    );
    expect(grantCreditMock).not.toHaveBeenCalled();
  });

  it('falls back to extra_edited_video when only legacy pack_size is set', async () => {
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', role: null, is_primary: true },
      ],
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 5,
    });

    await onCreditsCheckoutCompleted(
      buildSession({
        metadata: {
          kind: 'credits',
          client_id: 'client-1',
          pack_size: '3',
        } as Stripe.Metadata,
      }),
      admin,
      'nativz',
    );

    expect(grantCreditMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        clientId: 'client-1',
        delta: 3,
        kind: 'grant_topup',
        idempotencyKey: 'topup:cs_test_123',
        deliverableTypeSlug: 'edited_video',
      }),
    );
  });

  it('grants credits, persists payment intent + actor, and sends a receipt email', async () => {
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', role: null, is_primary: true },
        {
          name: 'Bob Smith',
          email: 'bob@acme.com',
          role: 'paid media only',
          is_primary: false,
        },
      ],
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 11,
    });

    await onCreditsCheckoutCompleted(
      buildSession({
        metadata: {
          kind: 'credits',
          client_id: 'client-1',
          actor_user_id: 'user-9',
          addon_slug: 'extra_edited_video',
          quantity: '2',
        } as Stripe.Metadata,
      }),
      admin,
      'nativz',
    );

    expect(grantCreditMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        clientId: 'client-1',
        delta: 2,
        actorUserId: 'user-9',
        stripePaymentIntent: 'pi_test_123',
      }),
    );
    expect(sendAddonReceiptMock).toHaveBeenCalledTimes(1);
    const call = sendAddonReceiptMock.mock.calls[0][0];
    // Paid-media-only contact must be excluded from the recipient list.
    expect(call.to).toEqual(['jane@acme.com']);
    expect(call.newBalance).toBe(11);
    expect(call.amountPaidCents).toBe(15000);
    expect(call.deliverableNounPlural).toBe('edited videos');
    expect(call.receiptUrl).toBe('https://stripe.com/receipts/r_1');
  });

  it('skips the credit grant for SLA modifier SKUs (rush) and still sends a receipt', async () => {
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', role: null, is_primary: true },
      ],
    });

    await onCreditsCheckoutCompleted(
      buildSession({
        amount_total: 14900,
        metadata: {
          kind: 'credits',
          client_id: 'client-1',
          addon_slug: 'rush_upgrade',
          quantity: '1',
        } as Stripe.Metadata,
      }),
      admin,
      'nativz',
    );

    expect(grantCreditMock).not.toHaveBeenCalled();
    expect(sendAddonReceiptMock).toHaveBeenCalledTimes(1);
    const call = sendAddonReceiptMock.mock.calls[0][0];
    // Modifier path: no plural noun, balance is null.
    expect(call.deliverableNounPlural).toBeNull();
    expect(call.newBalance).toBeNull();
    expect(call.addonLabel).toBe('Rush Delivery');
  });

  it('returns early without emailing when grantCredit reports already_granted', async () => {
    const { admin } = makeAdmin({});
    grantCreditMock.mockResolvedValueOnce({ already_granted: true });

    await onCreditsCheckoutCompleted(buildSession(), admin, 'nativz');

    expect(grantCreditMock).toHaveBeenCalledTimes(1);
    expect(sendAddonReceiptMock).not.toHaveBeenCalled();
  });

  it('skips the email when no eligible recipients are configured', async () => {
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [], // no contacts at all
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 5,
    });

    await onCreditsCheckoutCompleted(buildSession(), admin, 'nativz');
    expect(sendAddonReceiptMock).not.toHaveBeenCalled();
  });

  it('logs a failed_email_attempts row when Resend reports a non-throw failure', async () => {
    const failedInsert = vi.fn(async () => ({ error: null }));
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', role: null, is_primary: true },
      ],
      insertSpy: failedInsert,
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 7,
    });
    sendAddonReceiptMock.mockResolvedValueOnce({ ok: false, error: 'resend down' });

    await onCreditsCheckoutCompleted(buildSession(), admin, 'nativz');

    expect(failedInsert).toHaveBeenCalledTimes(1);
    expect(failedInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-1',
        template: 'deliverable_addon_receipt',
        period_id: 'cs_test_123',
        recipients: ['jane@acme.com'],
        error_message: 'resend down',
      }),
    );
  });

  it('logs a failed_email_attempts row when sendDeliverableAddonReceiptEmail throws', async () => {
    const failedInsert = vi.fn(async () => ({ error: null }));
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', role: null, is_primary: true },
      ],
      insertSpy: failedInsert,
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 1,
    });
    sendAddonReceiptMock.mockRejectedValueOnce(new Error('network blew up'));

    await onCreditsCheckoutCompleted(buildSession(), admin, 'nativz');

    expect(failedInsert).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: 'network blew up' }),
    );
  });

  it('falls back to the portal link when the Stripe receipt fetch fails', async () => {
    const { admin } = makeAdmin({
      clients: { name: 'Acme', agency: 'nativz' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', role: null, is_primary: true },
      ],
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 5,
    });
    paymentIntentsRetrieveMock.mockRejectedValueOnce(new Error('stripe 500'));

    await onCreditsCheckoutCompleted(buildSession(), admin, 'nativz');

    const call = sendAddonReceiptMock.mock.calls[0][0];
    expect(call.receiptUrl).toBeNull();
    expect(call.deliverablesUrl).toMatch(/\/deliverables$/);
  });

  it('warns but still grants when the verified webhook agency disagrees with the db agency', async () => {
    getBrandFromAgencyMock.mockReturnValueOnce('anderson');
    const warnSpy = vi.spyOn(console, 'warn');
    const { admin } = makeAdmin({
      clients: { name: 'AC client', agency: 'Anderson Collaborative' },
      contacts: [
        { name: 'Jane Doe', email: 'jane@ac.com', role: null, is_primary: true },
      ],
    });
    grantCreditMock.mockResolvedValueOnce({
      granted: true,
      tx_id: 'tx-1',
      new_balance: 3,
    });

    await onCreditsCheckoutCompleted(buildSession(), admin, 'nativz');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/agency mismatch.*webhook=nativz.*db=anderson/),
    );
    expect(grantCreditMock).toHaveBeenCalledTimes(1);
    expect(sendAddonReceiptMock).toHaveBeenCalledTimes(1);
    expect(sendAddonReceiptMock.mock.calls[0][0].agency).toBe('anderson');
  });
});

function buildCharge(over: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: 'ch_test_1',
    object: 'charge',
    amount: 15000,
    payment_intent: 'pi_test_1',
    refunds: {
      object: 'list',
      data: [{ id: 're_1', amount: 5000 } as Stripe.Refund],
      has_more: false,
      url: '',
    },
    ...over,
  } as Stripe.Charge;
}

describe('onCreditsChargeRefunded', () => {
  it('no-ops when the charge has no matching credits grant (proposal flow)', async () => {
    const { admin } = makeAdmin({ grant: null });
    await onCreditsChargeRefunded(buildCharge(), admin);
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('no-ops when charge.refunds.data is empty (defensive)', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 3,
        deliverable_type_id: 'type-edited-video',
      },
    });
    await onCreditsChargeRefunded(
      buildCharge({
        refunds: { object: 'list', data: [], has_more: false, url: '' },
      }),
      admin,
    );
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('no-ops when the most recent refund has zero amount', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 3,
        deliverable_type_id: 'type-edited-video',
      },
    });
    await onCreditsChargeRefunded(
      buildCharge({
        refunds: {
          object: 'list',
          data: [{ id: 're_1', amount: 0 } as Stripe.Refund],
          has_more: false,
          url: '',
        },
      }),
      admin,
    );
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('no-ops when derived unit price is non-positive (charge < pack_size)', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 100,
        deliverable_type_id: 'type-edited-video',
      },
    });
    // amount=10 / delta=100 -> floor(0.1)=0, must skip
    await onCreditsChargeRefunded(buildCharge({ amount: 10 }), admin);
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('claws back floor(refund.amount / unit_price) credits with refund-keyed idempotency', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 3, // unit price 5000
        deliverable_type_id: 'type-edited-video',
      },
    });
    // 12000 / 5000 = floor 2
    await onCreditsChargeRefunded(
      buildCharge({
        amount: 15000,
        refunds: {
          object: 'list',
          data: [{ id: 're_xyz', amount: 12000 } as Stripe.Refund],
          has_more: false,
          url: '',
        },
      }),
      admin,
    );

    expect(expireCreditMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        clientId: 'client-1',
        delta: -2,
        idempotencyKey: 'expire:refund:re_xyz',
        note: 'stripe_refund:ch_test_1',
        deliverableTypeSlug: 'edited_video',
      }),
    );
  });

  it('skips when refund is smaller than one credit unit', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 3, // unit 5000
        deliverable_type_id: 'type-edited-video',
      },
    });
    await onCreditsChargeRefunded(
      buildCharge({
        amount: 15000,
        refunds: {
          object: 'list',
          data: [{ id: 're_dust', amount: 100 } as Stripe.Refund],
          has_more: false,
          url: '',
        },
      }),
      admin,
    );
    expect(expireCreditMock).not.toHaveBeenCalled();
  });
});

describe('onCreditsChargeDisputed', () => {
  function buildDispute(over: Partial<Stripe.Dispute> = {}): Stripe.Dispute {
    return {
      id: 'dp_1',
      object: 'dispute',
      amount: 15000,
      charge: 'ch_test_1',
      ...over,
    } as Stripe.Dispute;
  }

  it('no-ops when dispute.charge is missing', async () => {
    const { admin } = makeAdmin({});
    await onCreditsChargeDisputed(
      buildDispute({ charge: null as unknown as string }),
      admin,
      'nativz',
    );
    expect(expireCreditMock).not.toHaveBeenCalled();
    expect(chargesRetrieveMock).not.toHaveBeenCalled();
  });

  it('logs and no-ops when the charge fetch from Stripe fails', async () => {
    const { admin } = makeAdmin({});
    chargesRetrieveMock.mockRejectedValueOnce(new Error('not found'));
    await onCreditsChargeDisputed(buildDispute(), admin, 'nativz');
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('no-ops when the fetched charge has no matching credits grant', async () => {
    const { admin } = makeAdmin({ grant: null });
    chargesRetrieveMock.mockResolvedValueOnce(buildCharge());
    await onCreditsChargeDisputed(buildDispute(), admin, 'nativz');
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('claws back floor(dispute.amount / unit_price) with dispute-keyed idempotency', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 3, // unit price 5000
        deliverable_type_id: 'type-edited-video',
      },
    });
    chargesRetrieveMock.mockResolvedValueOnce(buildCharge({ amount: 15000 }));

    await onCreditsChargeDisputed(
      buildDispute({ id: 'dp_99', amount: 15000 }),
      admin,
      'nativz',
    );

    expect(expireCreditMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        clientId: 'client-1',
        delta: -3,
        idempotencyKey: 'expire:dispute:dp_99',
        note: 'stripe_dispute:dp_99',
        deliverableTypeSlug: 'edited_video',
      }),
    );
  });

  it('falls back to charge.amount when dispute.amount is null', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 3,
        deliverable_type_id: 'type-edited-video',
      },
    });
    chargesRetrieveMock.mockResolvedValueOnce(buildCharge({ amount: 15000 }));

    await onCreditsChargeDisputed(
      buildDispute({ amount: null as unknown as number }),
      admin,
      'nativz',
    );

    expect(expireCreditMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ delta: -3 }),
    );
  });

  it('no-ops when computed unit price is non-positive', async () => {
    const { admin } = makeAdmin({
      grant: {
        client_id: 'client-1',
        delta: 100,
        deliverable_type_id: 'type-edited-video',
      },
    });
    chargesRetrieveMock.mockResolvedValueOnce(buildCharge({ amount: 10 }));
    await onCreditsChargeDisputed(buildDispute(), admin, 'nativz');
    expect(expireCreditMock).not.toHaveBeenCalled();
  });

  it('routes the charge fetch through the verified agency Stripe account', async () => {
    const { admin } = makeAdmin({ grant: null });
    chargesRetrieveMock.mockResolvedValueOnce(buildCharge());
    await onCreditsChargeDisputed(buildDispute(), admin, 'anderson');
    expect(getStripeMock).toHaveBeenCalledWith('anderson');
  });
});
