import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mock Resend + admin client before importing the state machine so the module
 * captures the mocks at load time.
 */
const sendOnboardingEmail = vi.fn(async (_args: unknown) => ({
  ok: true as const,
  id: 'resend-id-1',
}));
vi.mock('@/lib/email/resend', () => ({
  sendOnboardingEmail: (args: unknown) => sendOnboardingEmail(args),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}) as never,
}));

import { onInvoicePaid, onInvoiceOverdue } from './state-machine';

type Captured = {
  lifecycleInserts: Array<Record<string, unknown>>;
  notificationInserts: Array<Array<Record<string, unknown>>>;
  clientUpdates: Array<{ where: Record<string, unknown>; patch: Record<string, unknown> }>;
};

function makeAdmin(): { admin: SupabaseClient; captured: Captured } {
  const captured: Captured = {
    lifecycleInserts: [],
    notificationInserts: [],
    clientUpdates: [],
  };

  const admins = [{ id: 'admin-1' }, { id: 'admin-2' }];
  const contact = { email: 'client@example.com', name: 'Dana Smith' };
  const clientRow = {
    id: 'client-1',
    name: 'Acme Inc',
    slug: 'acme-inc',
    lifecycle_state: 'contracted',
  };

  // Each `from(table)` returns a narrow fluent shape that satisfies the
  // specific chain the state-machine actually calls on that table. We use
  // `any`-ish returns to keep the mock lean — the contract is verified by
  // the state-machine's runtime usage, not structural typing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string): any => {
    if (table === 'client_lifecycle_events') {
      return {
        insert: (row: Record<string, unknown>) => {
          captured.lifecycleInserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'users') {
      return { select: () => ({ or: () => Promise.resolve({ data: admins, error: null }) }) };
    }
    if (table === 'notifications') {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          captured.notificationInserts.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'clients') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: clientRow, error: null }) }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (k1: string, v1: unknown) => {
            const nested = {
              eq: (k2: string, v2: unknown) => {
                captured.clientUpdates.push({ where: { [k1]: v1, [k2]: v2 }, patch });
                return Promise.resolve({ error: null });
              },
              then: (resolve: (v: { error: null }) => unknown) => {
                captured.clientUpdates.push({ where: { [k1]: v1 }, patch });
                return resolve({ error: null });
              },
            };
            return nested;
          },
        }),
      };
    }
    if (table === 'contacts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: contact, error: null }) }),
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

  return { admin: { from } as unknown as SupabaseClient, captured };
}

describe('onInvoicePaid', () => {
  beforeEach(() => {
    sendOnboardingEmail.mockClear();
    sendOnboardingEmail.mockResolvedValue({ ok: true as const, id: 'resend-id-1' });
  });

  it('logs a lifecycle event, notifies admins, marks deposit paid, emails the client', async () => {
    const { admin, captured } = makeAdmin();

    await onInvoicePaid(
      {
        id: 'in_test_1',
        client_id: 'client-1',
        number: 'INV-0042',
        amount_paid_cents: 150000,
        amount_due_cents: 150000,
        currency: 'usd',
        hosted_invoice_url: 'https://pay.stripe.test',
        status: 'paid',
      },
      { admin, stripeEventId: 'evt_1' },
    );

    const types = captured.lifecycleInserts.map((r) => r.type);
    expect(types).toContain('invoice.paid');
    // Deposit-paid lifecycle bridge still fires when the contracted client
    // pays — the onboarding-row advance is gone, but the lifecycle log entry
    // remains.
    expect(types).toContain('onboarding.advanced');

    const notificationRows = captured.notificationInserts.flat();
    expect(notificationRows.length).toBe(2);
    expect(notificationRows.every((r) => r.type === 'payment_received')).toBe(true);
    expect(notificationRows.map((r) => r.user_id).sort()).toEqual(['admin-1', 'admin-2']);

    expect(sendOnboardingEmail).toHaveBeenCalledTimes(1);
    const firstCall = sendOnboardingEmail.mock.calls[0];
    expect(firstCall).toBeDefined();
    const emailArgs = firstCall![0] as { to: string; subject: string; html: string };
    expect(emailArgs.to).toBe('client@example.com');
    expect(emailArgs.html).toContain('Dana');
    expect(emailArgs.html).toContain('Acme Inc');
    expect(emailArgs.html).not.toContain('{{contact_first_name}}');
    expect(emailArgs.html).not.toContain('{{client_name}}');
  });

  it('is a no-op when client_id is null', async () => {
    const { admin, captured } = makeAdmin();
    await onInvoicePaid(
      {
        id: 'in_unlinked',
        client_id: null,
        number: null,
        amount_paid_cents: 5000,
        amount_due_cents: 5000,
        currency: 'usd',
        hosted_invoice_url: null,
        status: 'paid',
      },
      { admin },
    );
    expect(captured.lifecycleInserts).toEqual([]);
    expect(captured.notificationInserts).toEqual([]);
    expect(sendOnboardingEmail).not.toHaveBeenCalled();
  });
});

describe('onInvoiceOverdue', () => {
  it('logs an event and notifies admins', async () => {
    const { admin, captured } = makeAdmin();
    await onInvoiceOverdue(
      {
        id: 'in_overdue_1',
        client_id: 'client-1',
        number: 'INV-0099',
        amount_paid_cents: 0,
        amount_due_cents: 200000,
        currency: 'usd',
        hosted_invoice_url: null,
        status: 'open',
      },
      admin,
    );
    expect(captured.lifecycleInserts.some((e) => e.type === 'invoice.overdue')).toBe(true);
    expect(
      captured.notificationInserts.flat().every((r) => r.type === 'invoice_overdue'),
    ).toBe(true);
  });
});
