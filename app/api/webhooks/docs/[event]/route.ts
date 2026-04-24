import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { onProposalCheckoutCompleted } from '@/lib/proposals/on-paid';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';

/**
 * Inbound webhook for the docs hosts (docs.nativz.io, docs.andersoncollaborative.com).
 *
 * The Cloudflare Pages Functions in nativz-docs + ac-docs POST here when a
 * proposal is viewed, signed, or a deposit is paid. This endpoint updates the
 * proposals row status, fires the lifecycle event, and writes a proposal_events
 * trail so /admin/proposals/[slug] shows the full timeline.
 *
 * Events supported (URL path param [event]):
 *   viewed  — signer opened the proposal page
 *   signed  — signer completed the Sign & Pay form (pre-deposit)
 *   paid    — Stripe deposit cleared on the CF side (counter-sign fired)
 *
 * Auth: shared secret in `Authorization: Bearer ${DOCS_WEBHOOK_SECRET}`.
 * Required on both sides — set the same value in Cortex env + CF pages project env.
 */

export const runtime = 'nodejs';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

const EVENT_VALUES = ['viewed', 'signed', 'paid'] as const;
type DocsEvent = (typeof EVENT_VALUES)[number];

function isDocsEvent(s: string): s is DocsEvent {
  return (EVENT_VALUES as readonly string[]).includes(s);
}

const bodySchema = z.object({
  proposal_id: z.string().uuid().optional(),
  external_folder: z.string().min(1).optional(),
  // Context the CF side wants to record (who signed, what agency, etc.).
  // Everything is additive metadata — none is required for the update itself.
  signer_email: z.string().email().optional().nullable(),
  signer_name: z.string().max(200).optional().nullable(),
  stripe_session_id: z.string().optional().nullable(),
  stripe_payment_intent: z.string().optional().nullable(),
  stripe_customer: z.string().optional().nullable(),
  amount_cents: z.number().int().nonnegative().optional().nullable(),
  ip: z.string().max(64).optional().nullable(),
  pdf_hash: z.string().max(128).optional().nullable(),
  occurred_at: z.string().datetime().optional(),
}).refine((v) => v.proposal_id || v.external_folder, {
  message: 'Either proposal_id or external_folder is required',
});

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

function requireSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.DOCS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DOCS_WEBHOOK_SECRET not configured' }, { status: 500 });
  }
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token || !constantTimeEqual(token, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ event: string }> }) {
  const { event } = await ctx.params;
  if (!isDocsEvent(event)) {
    return NextResponse.json(
      { error: `Unknown event '${event}'. Valid: ${EVENT_VALUES.join(', ')}.` },
      { status: 404 },
    );
  }

  const authFail = requireSecret(req);
  if (authFail) return authFail;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const admin = createAdminClient();

  // Resolve the proposal — by proposal_id if present, otherwise by external_folder
  // (the CF side always knows the folder from its URL path, the id from client.json).
  let query = admin
    .from('proposals')
    .select('id, client_id, title, status, external_url, paid_at, signed_at, viewed_at, agency');
  if (body.proposal_id) query = query.eq('id', body.proposal_id);
  else if (body.external_folder) query = query.eq('external_folder', body.external_folder);
  const { data: proposal } = await query.maybeSingle();
  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found for that id/folder' }, { status: 404 });
  }

  const occurredAt = body.occurred_at ?? new Date().toISOString();

  switch (event) {
    case 'viewed': {
      // Only advance viewed_at once — multiple opens from the signer shouldn't
      // keep overwriting. Always log the event for the activity feed.
      if (!proposal.viewed_at) {
        await admin
          .from('proposals')
          .update({
            viewed_at: occurredAt,
            status: proposal.status === 'sent' ? 'viewed' : proposal.status,
          })
          .eq('id', proposal.id);
      }
      await admin.from('proposal_events').insert({
        proposal_id: proposal.id,
        type: 'viewed',
        ip: body.ip ?? null,
        metadata: {
          signer_email: body.signer_email ?? null,
          signer_name: body.signer_name ?? null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    case 'signed': {
      // Idempotent — the CF side may POST twice if an intermittent error occurs.
      if (!proposal.signed_at) {
        await admin
          .from('proposals')
          .update({
            signed_at: occurredAt,
            status: proposal.status === 'paid' ? 'paid' : 'signed',
          })
          .eq('id', proposal.id);
        if (proposal.client_id) {
          await admin
            .from('clients')
            .update({ lifecycle_state: 'contracted' })
            .eq('id', proposal.client_id)
            .eq('lifecycle_state', 'lead');
          await logLifecycleEvent(
            proposal.client_id,
            'proposal.signed',
            `Proposal signed: ${proposal.title}`,
            {
              metadata: {
                proposal_id: proposal.id,
                signer_email: body.signer_email ?? null,
                pdf_hash: body.pdf_hash ?? null,
              },
              admin,
            },
          );
        }
      }
      await admin.from('proposal_events').insert({
        proposal_id: proposal.id,
        type: 'signed',
        ip: body.ip ?? null,
        metadata: {
          signer_email: body.signer_email ?? null,
          signer_name: body.signer_name ?? null,
          pdf_hash: body.pdf_hash ?? null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    case 'paid': {
      // Deposit cleared — either mirror the Stripe webhook (if CF fires both)
      // or mark as paid directly. Idempotent.
      if (!proposal.paid_at && body.stripe_session_id) {
        // Try to look up the real Stripe session via the agency's Stripe client
        // so downstream lifecycle logic has accurate amount/customer data.
        try {
          const stripe = getStripe(proposal.agency ?? 'nativz');
          const session = (await stripe.checkout.sessions.retrieve(
            body.stripe_session_id,
          )) as Stripe.Checkout.Session;
          await onProposalCheckoutCompleted(session, admin);
        } catch (err) {
          // If Stripe lookup fails, fall back to a simple row update so Cortex
          // still reflects the paid state; admin can reconcile later.
          console.error('[docs:paid] stripe session retrieve failed:', err);
          await admin
            .from('proposals')
            .update({ status: 'paid', paid_at: occurredAt })
            .eq('id', proposal.id);
        }
      } else if (!proposal.paid_at) {
        await admin
          .from('proposals')
          .update({ status: 'paid', paid_at: occurredAt })
          .eq('id', proposal.id);
      }
      await admin.from('proposal_events').insert({
        proposal_id: proposal.id,
        type: 'paid',
        metadata: {
          stripe_session_id: body.stripe_session_id ?? null,
          stripe_payment_intent: body.stripe_payment_intent ?? null,
          stripe_customer: body.stripe_customer ?? null,
          amount_cents: body.amount_cents ?? null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: 'Unhandled event' }, { status: 400 });
  }
}
