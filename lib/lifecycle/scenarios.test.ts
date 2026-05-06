/**
 * Scenario tests for production bugs in the lifecycle state machine.
 * Each test freezes the correct behaviour for one specific bug so a future
 * refactor can't silently reintroduce it. When a new bug is found, add a
 * scenario here as part of the fix commit.
 *
 * The Revenue Hub strip (2026-05-06) removed the net-revenue scenarios
 * that lived in this file alongside the kickoff-email guard. They went
 * out with `lib/revenue/aggregates.ts`.
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

type State = {
  clients: Map<string, {
    id: string;
    name: string;
    slug: string;
    lifecycle_state: string;
    kickoff_email_sent_at: string | null;
  }>;
  contacts: Map<string, { email: string; name: string }>;
  admins: Array<{ id: string }>;
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
    admins: [{ id: 'admin-1' }],
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
    if (table === 'client_contracts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table in mock: ${table}`);
  };
  return { from } as unknown as SupabaseClient;
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

