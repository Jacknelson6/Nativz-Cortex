/**
 * POST /api/invites/bulk
 *
 * Create N portal invite tokens for a single client, one per supplied
 * contact, and send each one the branded Resend email used by the
 * single-invite flow. Per-contact results are returned so the UI can show
 * which ones sent vs failed.
 *
 * @auth Required (admin)
 * @body client_id - Client UUID (required)
 * @body contacts - [{ email, name? }] (1-100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendClientInviteEmail } from '@/lib/email/resend';
import { getBrandFromAgency } from '@/lib/agency/use-agency-brand';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export const maxDuration = 60;

const schema = z.object({
  client_id: z.string().uuid(),
  contacts: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(100),
});

type ContactResult = {
  email: string;
  name: string | null;
  status: 'sent' | 'failed';
  invite_url?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, full_name, email')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { client_id, contacts } = parsed.data;

    // Dedupe (case-insensitive) in case the client didn't
    const deduped = new Map<string, { email: string; name?: string }>();
    for (const c of contacts) {
      const key = c.email.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, { email: key, name: c.name });
    }
    const finalContacts = Array.from(deduped.values());

    const { data: client } = await adminClient
      .from('clients')
      .select('id, name, organization_id, agency')
      .eq('id', client_id)
      .single();

    if (!client || !client.organization_id) {
      return NextResponse.json({ error: 'Client not found or missing organization' }, { status: 404 });
    }

    const invitedBy = userData?.full_name?.trim() || userData?.email || 'your team';
    const agency = getBrandFromAgency(client.agency);
    // The invite link must live on the host that matches the email branding
    // (an AC-themed email on a cortex.nativz.io link breaks the brand
    // experience). Admins can hit this route from either host, so we ignore
    // `request.nextUrl.origin` here and resolve per-agency.
    const baseUrl = getCortexAppUrl(agency);

    // Create all invite tokens in one insert — we associate each token with a
    // contact by array index rather than running N round-trips.
    const { data: tokens, error: insertError } = await adminClient
      .from('invite_tokens')
      .insert(
        finalContacts.map(() => ({
          client_id: client.id,
          organization_id: client.organization_id,
          created_by: user.id,
        })),
      )
      .select('token, expires_at');

    if (insertError || !tokens || tokens.length !== finalContacts.length) {
      const detail = insertError
        ? `${insertError.message} (code ${insertError.code ?? '?'}, hint ${insertError.hint ?? '-'})`
        : `inserted ${tokens?.length ?? 0} / ${finalContacts.length} tokens`;
      console.error('[invites/bulk] token insert failed:', detail, insertError);
      return NextResponse.json(
        { error: `Failed to create invite tokens: ${detail}` },
        { status: 500 },
      );
    }

    console.log(
      `[invites/bulk] sending ${finalContacts.length} invites for ${client.name} (agency=${agency}, invitedBy=${invitedBy})`,
    );

    // Send branded emails in parallel. `Promise.allSettled` so one bad
    // address doesn't kill the whole batch.
    const results = await Promise.allSettled(
      finalContacts.map(async (contact, i) => {
        const inviteUrl = `${baseUrl}/portal/join/${tokens[i].token}`;
        const fallbackName = contact.email.split('@')[0] ?? contact.email;
        try {
          const res = await sendClientInviteEmail({
            to: contact.email,
            contactName: contact.name?.trim() || fallbackName,
            clientName: client.name,
            inviteUrl,
            invitedBy,
            agency,
          });
          if (res.error) {
            const errMsg = res.error.message ?? JSON.stringify(res.error);
            console.warn(`[invites/bulk] resend failed for ${contact.email}:`, errMsg);
            return {
              email: contact.email,
              name: contact.name ?? null,
              status: 'failed' as const,
              invite_url: inviteUrl,
              error: errMsg,
            };
          }
          return {
            email: contact.email,
            name: contact.name ?? null,
            status: 'sent' as const,
            invite_url: inviteUrl,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[invites/bulk] threw for ${contact.email}:`, message);
          return {
            email: contact.email,
            name: contact.name ?? null,
            status: 'failed' as const,
            invite_url: inviteUrl,
            error: message,
          };
        }
      }),
    );

    const perContact: ContactResult[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        email: finalContacts[i].email,
        name: finalContacts[i].name ?? null,
        status: 'failed',
        error: r.reason instanceof Error ? r.reason.message : 'unknown error',
      };
    });

    const sentCount = perContact.filter((r) => r.status === 'sent').length;
    const failedCount = perContact.length - sentCount;

    return NextResponse.json({
      client_name: client.name,
      sent: sentCount,
      failed: failedCount,
      results: perContact,
    });
  } catch (error) {
    // Surface the real error message so the admin dialog can show it — the
    // old "Internal server error" text was masking everything from RLS
    // denials to Resend rate-limits.
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('POST /api/invites/bulk error:', message, stack);
    return NextResponse.json(
      {
        error: `Bulk invite failed: ${message}`,
        hint: 'Check server logs for the full stack trace.',
      },
      { status: 500 },
    );
  }
}
