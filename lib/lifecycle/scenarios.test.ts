/**
 * Scenario tests for every production bug found in a /revenue-review pass.
 * Each test freezes the correct behaviour for one specific bug so a future
 * refactor can't silently reintroduce it. When a new bug is found, add a
 * scenario here as part of the fix commit.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const sendOnboardingEmail = vi.fn(async (_args: unknown) => ({
  ok: true as const,
  id: 'resend-1',
}));
vi.mock('@/lib/email/resend', () => ({
  sendOnboardingEmail: (args: unknown) => sendOnboardingEmail(args),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}) as never,
}));

import { onInvoicePaid } from './state-machine';
import { netLifetimeRevenueCents } from '@/lib/revenue/aggregates';

type State = {
  clients: Map<string, {
    id: string;
    name: string;
    slug: string;
    lifecycle_state: string;
    kickoff_email_sent_at: string | null;
  }>;
  contacts: Map<string, { email: string; name: string }>;
  tracker: { id: string; status: string } | null;
  firstPhase: { id: string; status: string; sort_order: number } | null;
  template: { subject: string; body: string } | null;
  admins: Array<{ id: string }>;
  invoices: Array<{
    client_id: string | null;
    amount_paid_cents: number;
    paid_at: string | null;
  }>;
  refunds: Array<{
    client_id: string | null;
    amount_cents: number;
    created_at: string;
    status: string;
  }>;
  lifecycleEvents: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  kickoffWrites: number;
};

function createState(): State {
  return {
    clients: new Map([
      [
        'client-1',
        {
          id: 'client-1',
          name: 'Acme Inc',
          slug: 'acme-inc',
          lifecycle_state: 'contracted',
          kickoff_email_sent_at: null,
        },
      ],
    ]),
    contacts: new Map([['client-1', { email: 'dana@acme.test', name: 'Dana Smith' }]]),
    tracker: { id: 'tracker-1', status: 'active' },
    firstPhase: { id: 'phase-1', status: 'not_started', sort_order: 0 },
    template: {
      subject: 'Welcome — kickoff',
      body: '<p>Hi {{contact_first_name}}, welcome {{client_name}}. Schedule: {{kickoff_url}}</p>',
    },
    admins: [{ id: 'admin-1' }],
    invoices: [],
    refunds: [],
    lifecycleEvents: [],
    notifications: [],
    kickoffWrites: 0,
  };
}

function makeAdmin(state: State): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string): any => {
    if (table === 'client_lifecycle_events') {
      return {
        insert: (row: Record<string, unknown>) => {
          state.lifecycleEvents.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'users') {
      return { select: () => ({ or: () => Promise.resolve({ data: state.admins, error: null }) }) };
    }
    if (table === 'notifications') {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          state.notifications.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'clients') {
      return {
        select: () => ({
          eq: (_k: string, v: string) => ({
            maybeSingle: () =>
              Promise.resolve({ data: state.clients.get(v) ?? null, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_k: string, v1: string) => {
            const chain = {
              eq: (_k2: string, _v2: unknown) => {
                const row = state.clients.get(v1);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ error: null });
              },
              in: (_k2: string, _vs: unknown[]) => {
                const row = state.clients.get(v1);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ error: null });
              },
              then: (resolve: (v: { error: null }) => unknown) => {
                const row = state.clients.get(v1);
                if (row) {
                  Object.assign(row, patch);
                  if ('kickoff_email_sent_at' in patch) state.kickoffWrites += 1;
                }
                return resolve({ error: null });
              },
            };
            return chain;
          },
        }),
      };
    }
    if (table === 'onboarding_trackers') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: state.tracker, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'onboarding_phases') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: state.firstPhase, error: null }),
              }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            if (state.firstPhase) Object.assign(state.firstPhase, patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'contacts') {
      return {
        select: () => ({
          eq: (_k: string, v: string) => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: state.contacts.get(v) ?? null, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'onboarding_email_templates') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.template, error: null }),
          }),
        }),
      };
    }
    if (table === 'client_contracts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
      };
    }
    if (table === 'stripe_invoices') {
      return aggregateBuilder(() => state.invoices.filter((x) => x.paid_at !== null));
    }
    if (table === 'stripe_refunds') {
      return aggregateBuilder(() => state.refunds.filter((x) => x.status === 'succeeded'));
    }
    throw new Error(`Unexpected table in mock: ${table}`);
  };
  return { from } as unknown as SupabaseClient;
}

/**
 * Minimal chainable builder for the query shape aggregates.ts uses. Every
 * filter accumulates into a filter list and the final await resolves the
 * data set. Supports select, not, eq, gte, lte, order, limit — the subset
 * of PostgREST methods we call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aggregateBuilder<T extends Record<string, any>>(initial: () => T[]) {
  const filters: Array<(row: T) => boolean> = [];
  const run = (): Promise<{ data: T[]; error: null }> => {
    const rows = initial().filter((r) => filters.every((f) => f(r)));
    return Promise.resolve({ data: rows, error: null });
  };

  const chain = {
    select: () => chain,
    not: (col: string, _op: string, _val: unknown) => {
      filters.push((r) => r[col] !== null && r[col] !== undefined);
      return chain;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return chain;
    },
    gte: (col: string, val: unknown) => {
      filters.push((r) => String(r[col]) >= String(val));
      return chain;
    },
    lte: (col: string, val: unknown) => {
      filters.push((r) => String(r[col]) <= String(val));
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    then: <R,>(resolve: (v: { data: T[]; error: null }) => R) => run().then(resolve),
  };
  return chain;
}

describe('bug: kickoff email re-sent on every monthly payment', () => {
  beforeEach(() => {
    sendOnboardingEmail.mockClear();
  });

  it('sends kickoff email once, never again on a later invoice.paid', async () => {
    const state = createState();
    const admin = makeAdmin(state);

    // First invoice.paid — fresh client, email should fire.
    await onInvoicePaid(
      {
        id: 'in_1',
        client_id: 'client-1',
        number: 'INV-1',
        amount_paid_cents: 100000,
        amount_due_cents: 100000,
        currency: 'usd',
        hosted_invoice_url: null,
        status: 'paid',
      },
      { admin },
    );

    // Our kickoff-once guard sets kickoff_email_sent_at after a successful send.
    // Simulate that the update landed by reading and asserting.
    expect(state.clients.get('client-1')!.kickoff_email_sent_at).not.toBeNull();
    expect(sendOnboardingEmail).toHaveBeenCalledTimes(1);

    // Second invoice.paid for the same client — ongoing monthly retainer.
    // Must NOT re-send the kickoff email.
    sendOnboardingEmail.mockClear();
    await onInvoicePaid(
      {
        id: 'in_2',
        client_id: 'client-1',
        number: 'INV-2',
        amount_paid_cents: 100000,
        amount_due_cents: 100000,
        currency: 'usd',
        hosted_invoice_url: null,
        status: 'paid',
      },
      { admin },
    );
    expect(sendOnboardingEmail).not.toHaveBeenCalled();
  });
});

describe('bug: refund math not subtracted from lifetime revenue', () => {
  it('netLifetimeRevenueCents = paid − refunded', async () => {
    const state = createState();
    state.invoices = [
      {
        client_id: 'client-1',
        amount_paid_cents: 100000, // $1000
        paid_at: '2026-04-01T00:00:00Z',
      },
    ];
    state.refunds = [
      {
        client_id: 'client-1',
        amount_cents: 50000, // $500 refund
        created_at: '2026-04-10T00:00:00Z',
        status: 'succeeded',
      },
    ];
    const admin = makeAdmin(state);
    const net = await netLifetimeRevenueCents(admin, { clientId: 'client-1' });
    expect(net).toBe(50000);
  });

  it('clamps net at 0 when refunds exceed payments (over-refund case)', async () => {
    const state = createState();
    state.invoices = [
      { client_id: 'client-1', amount_paid_cents: 50000, paid_at: '2026-04-01T00:00:00Z' },
    ];
    state.refunds = [
      {
        client_id: 'client-1',
        amount_cents: 70000,
        created_at: '2026-04-10T00:00:00Z',
        status: 'succeeded',
      },
    ];
    const admin = makeAdmin(state);
    const net = await netLifetimeRevenueCents(admin, { clientId: 'client-1' });
    expect(net).toBe(0);
  });

  it('ignores failed/canceled refunds', async () => {
    const state = createState();
    state.invoices = [
      { client_id: 'client-1', amount_paid_cents: 100000, paid_at: '2026-04-01T00:00:00Z' },
    ];
    state.refunds = [
      {
        client_id: 'client-1',
        amount_cents: 50000,
        created_at: '2026-04-10T00:00:00Z',
        status: 'failed',
      },
    ];
    const admin = makeAdmin(state);
    const net = await netLifetimeRevenueCents(admin, { clientId: 'client-1' });
    expect(net).toBe(100000);
  });
});
