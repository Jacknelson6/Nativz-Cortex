/**
 * GET /api/invites?client_id=X
 *
 * List all invite tokens for a client, with status info.
 *
 * POST /api/invites
 *
 * Create a portal invite token for a client. The token is used to generate a
 * join URL that allows a new portal user to register and be linked to the client's organization.
 *
 * @auth Required (admin)
 * @body client_id - Client UUID to create the invite for (required)
 * @returns {{ token: string, invite_url: string, expires_at: string, client_name: string }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendClientInviteEmail } from '@/lib/email/resend';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

const createInviteSchema = z.object({
  client_id: z.string().uuid(),
  // Optional: email the invite directly rather than just returning the URL.
  email: z.string().email().optional(),
  contact_name: z.string().min(1).max(120).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clientId = request.nextUrl.searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    // Need the client's agency so the URLs we return point at the matching
    // Cortex host (AC invites on the AC host, Nativz on nativz.io).
    const { data: clientRow } = await adminClient
      .from('clients')
      .select('agency')
      .eq('id', clientId)
      .maybeSingle();
    const clientAgency = getBrandFromAgency(clientRow?.agency ?? null);
    const baseUrl = getCortexAppUrl(clientAgency);

    const { data: invites, error } = await adminClient
      .from('invite_tokens')
      .select('id, token, email, expires_at, used_at, used_by, created_at, created_by')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch invites:', error);
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
    }

    // Enrich with used_by user info
    const usedByIds = (invites ?? []).filter(i => i.used_by).map(i => i.used_by);
    const usedByMap: Record<string, { email: string; full_name: string }> = {};
    if (usedByIds.length > 0) {
      const { data: usedByUsers } = await adminClient
        .from('users')
        .select('id, email, full_name')
        .in('id', usedByIds);
      for (const u of usedByUsers ?? []) {
        usedByMap[u.id] = { email: u.email, full_name: u.full_name };
      }
    }

    const enriched = (invites ?? []).map(inv => {
      const now = new Date();
      const expired = new Date(inv.expires_at) < now;
      const status = inv.used_at ? 'used' : expired ? 'expired' : 'active';

      return {
        id: inv.id,
        token: inv.token,
        email: inv.email ?? null,
        invite_url: `${baseUrl}/join/${inv.token}`,
        status,
        expires_at: inv.expires_at,
        used_at: inv.used_at,
        used_by: inv.used_by ? usedByMap[inv.used_by] ?? null : null,
        created_at: inv.created_at,
      };
    });

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('GET /api/invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { client_id, email, contact_name } = parsed.data;

    // Get client + organization_id + agency (for email branding)
    const { data: client } = await adminClient
      .from('clients')
      .select('id, name, organization_id, agency')
      .eq('id', client_id)
      .single();

    if (!client || !client.organization_id) {
      return NextResponse.json({ error: 'Client not found or missing organization' }, { status: 404 });
    }

    // Create invite token. We persist `email` when supplied so the contacts UI
    // can correlate "invited - pending" state back to a specific contact row.
    const { data: invite, error } = await adminClient
      .from('invite_tokens')
      .insert({
        client_id: client.id,
        organization_id: client.organization_id,
        created_by: user.id,
        email: email ?? null,
      })
      .select('token, expires_at')
      .single();

    if (error) {
      console.error('Failed to create invite:', error);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // Resolve agency first, then pick the matching Cortex host so the
    // invite link in the email points at cortex.andersoncollaborative.com
    // for AC-themed emails and cortex.nativz.io for Nativz emails —
    // regardless of which host the admin fired the request from.
    const agency = getBrandFromAgency(client.agency);
    const baseUrl = getCortexAppUrl(agency);
    const inviteUrl = `${baseUrl}/join/${invite.token}`;

    // If the admin supplied an email, send the branded invite directly.
    // Agency is resolved from the client's `agency` text field — new brands
    // get added to `getBrandFromAgency` rather than this route.
    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
    let emailError: string | null = null;
    if (email) {
      const { data: senderRow } = await adminClient
        .from('users')
        .select('full_name, email')
        .eq('id', user.id)
        .single();
      const invitedBy = senderRow?.full_name?.trim() || senderRow?.email || 'your team';
      try {
        const res = await sendClientInviteEmail({
          to: email,
          contactName: (contact_name?.trim() || email.split('@')[0]) ?? email,
          clientName: client.name,
          inviteUrl,
          invitedBy,
          agency,
        });
        if (res.error) {
          emailStatus = 'failed';
          emailError = res.error.message ?? 'resend error';
          console.warn('[invites] send failed:', emailError);
        } else {
          emailStatus = 'sent';
        }
      } catch (err) {
        emailStatus = 'failed';
        emailError = err instanceof Error ? err.message : 'unknown send error';
        console.warn('[invites] send threw:', emailError);
      }
    }

    return NextResponse.json({
      token: invite.token,
      invite_url: inviteUrl,
      expires_at: invite.expires_at,
      client_name: client.name,
      email_status: emailStatus,
      email_error: emailError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('POST /api/invites error:', message, stack);
    return NextResponse.json(
      {
        error: `Invite failed: ${message}`,
        hint: 'Check server logs for the full stack trace.',
      },
      { status: 500 },
    );
  }
}
