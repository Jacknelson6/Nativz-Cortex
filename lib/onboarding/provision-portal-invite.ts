import type { SupabaseClient } from '@supabase/supabase-js';
import { sendClientInviteEmail } from '@/lib/email/resend';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

/**
 * Mints a portal invite_tokens row for one email and (best-effort) sends the
 * branded invite email. Used by the public intake form when a client adds
 * emails to an `email_list` checklist item — we auto-provision Cortex viewer
 * accounts for those teammates without requiring admin action.
 *
 * Idempotency: callers pass `existingInvites` so we skip emails that were
 * already provisioned in a prior PATCH on the same item.
 *
 * Failure mode: invite creation MUST succeed; email send is best-effort.
 * If email send fails the invite still exists and an admin can resend from
 * /admin/clients/[slug]/settings/access.
 */

export interface PortalInviteRecord {
  email: string;
  token: string;
  invite_url: string;
  sent_at: string;
  email_status: 'sent' | 'failed' | 'skipped';
  email_error?: string;
}

export interface ProvisionPortalInviteArgs {
  admin: SupabaseClient;
  clientId: string;
  email: string;
  contactName?: string;
  invitedBy?: string;
}

export async function provisionPortalInviteForEmail(
  args: ProvisionPortalInviteArgs,
): Promise<PortalInviteRecord | { error: string }> {
  const { admin, clientId, email } = args;

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, name, organization_id, agency')
    .eq('id', clientId)
    .maybeSingle();
  if (clientError || !client || !client.organization_id) {
    return { error: 'Client missing organization_id' };
  }

  const { data: invite, error: insertError } = await admin
    .from('invite_tokens')
    .insert({
      client_id: client.id,
      organization_id: client.organization_id,
      created_by: null,
      email,
    })
    .select('token, expires_at')
    .single();
  if (insertError || !invite) {
    return { error: insertError?.message ?? 'Failed to create invite token' };
  }

  const agency = getBrandFromAgency((client.agency as string | null) ?? null);
  const baseUrl = getCortexAppUrl(agency);
  const inviteUrl = `${baseUrl}/join/${invite.token}`;

  const sentAt = new Date().toISOString();
  let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | undefined;

  try {
    const res = await sendClientInviteEmail({
      to: email,
      contactName: args.contactName?.trim() || email.split('@')[0] || email,
      clientName: client.name,
      inviteUrl,
      invitedBy: args.invitedBy?.trim() || 'your team',
      agency,
    });
    if (res.error) {
      emailStatus = 'failed';
      emailError = res.error.message ?? 'resend error';
    } else {
      emailStatus = 'sent';
    }
  } catch (err) {
    emailStatus = 'failed';
    emailError = err instanceof Error ? err.message : 'unknown send error';
  }

  return {
    email,
    token: invite.token,
    invite_url: inviteUrl,
    sent_at: sentAt,
    email_status: emailStatus,
    email_error: emailError,
  };
}
