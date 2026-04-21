import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import { buildUserEmailHtml } from '@/lib/email/templates/user-email';
import { resolveMergeFields } from '@/lib/email/merge-fields';
import { getSecret } from '@/lib/secrets/store';
import type { MergeContext } from '@/lib/email/types';
import type { AgencyBrand } from '@/lib/agency/detect';

let _resend: Resend | null = null;
let _resendKey: string | undefined;
async function client(): Promise<Resend> {
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!_resend || _resendKey !== apiKey) {
    _resend = new Resend(apiKey);
    _resendKey = apiKey;
  }
  return _resend;
}

export type CampaignRecipient = {
  contact_id: string | null;
  email: string;
  full_name: string | null;
  first_name: string | null;
  agency: AgencyBrand;
  client_name: string | null;
  client_id: string | null;
};

type SendArgs = {
  admin: SupabaseClient;
  campaignId: string;
  subject: string;
  bodyMarkdown: string;
  recipients: CampaignRecipient[];
  sender: { id: string; full_name: string | null; email: string | null };
};

/**
 * Deliver one campaign send-run in-process. For each recipient:
 *   1. inserts a draft email_messages row
 *   2. resolves merge tokens against the recipient + client context
 *   3. sends via Resend with the agency-correct from/reply-to
 *   4. updates the row with resend_id + status
 *
 * Failures are captured per recipient so one bad address doesn't abort the
 * batch. Returns the aggregate counts + the final campaign row.
 */
export async function sendCampaign(args: SendArgs) {
  const { admin, campaignId, subject, bodyMarkdown, recipients, sender } = args;

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const mergeCtx: MergeContext = {
      recipient: { full_name: r.full_name, email: r.email },
      sender: { full_name: sender.full_name, email: sender.email },
      client: { name: r.client_name },
    };
    const resolvedSubject = resolveMergeFields(subject, mergeCtx) || subject;
    const resolvedBody = resolveMergeFields(bodyMarkdown, mergeCtx);
    const html = buildUserEmailHtml(resolvedBody, r.agency);

    const { data: inserted } = await admin
      .from('email_messages')
      .insert({
        campaign_id: campaignId,
        contact_id: r.contact_id,
        recipient_email: r.email,
        agency: r.agency,
        from_address: getFromAddress(r.agency),
        subject: resolvedSubject,
        body_markdown: resolvedBody,
        status: 'sending',
        created_by: sender.id,
      })
      .select('id')
      .single();

    try {
      const res = await (await client()).emails.send({
        from: getFromAddress(r.agency),
        replyTo: getReplyTo(r.agency),
        to: r.email,
        subject: resolvedSubject,
        html,
      });
      if (res.error) throw new Error(res.error.message);
      const id = res.data?.id;
      if (!id) throw new Error('resend returned no id');

      if (inserted) {
        await admin
          .from('email_messages')
          .update({
            status: 'sent',
            resend_id: id,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', inserted.id);
      }
      sent += 1;
    } catch (err) {
      failed += 1;
      const reason = err instanceof Error ? err.message : 'unknown send error';
      if (inserted) {
        await admin
          .from('email_messages')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            failure_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', inserted.id);
      }
    }
  }

  const now = new Date().toISOString();
  await admin
    .from('email_campaigns')
    .update({
      status: failed > 0 && sent === 0 ? 'failed' : 'sent',
      sent_at: now,
      sent_count: sent,
      failed_count: failed,
      total_recipients: recipients.length,
      updated_at: now,
    })
    .eq('id', campaignId);

  return { sent, failed, total: recipients.length };
}

/**
 * Fan out raw audience selectors into a recipient list, attaching the right
 * agency for each row. Precedence:
 *   - explicit contact_ids array
 *   - list_id → email_list_members → email_contacts
 *   - audience_portal_only → users where role='viewer' joined via email_contacts
 *     by email (or inserted as synthetic contact rows on the fly)
 */
export async function resolveCampaignRecipients(
  admin: SupabaseClient,
  opts: {
    contactIds?: string[];
    listId?: string | null;
    portalOnly?: boolean;
    agencyOverride?: AgencyBrand | null;
    clientId?: string | null;
  },
): Promise<CampaignRecipient[]> {
  const contactIds = new Set<string>(opts.contactIds ?? []);

  if (opts.listId) {
    const { data: members } = await admin
      .from('email_list_members')
      .select('contact_id')
      .eq('list_id', opts.listId);
    for (const m of members ?? []) contactIds.add(m.contact_id);
  }

  const recipients: CampaignRecipient[] = [];

  if (contactIds.size > 0) {
    const { data: rows } = await admin
      .from('email_contacts')
      .select(`
        id, email, full_name, first_name, client_id, subscribed,
        client:client_id ( id, name, agency )
      `)
      .in('id', Array.from(contactIds));
    for (const r of rows ?? []) {
      if (!r.subscribed) continue;
      type ClientRel = { name: string | null; agency: string | null } | { name: string | null; agency: string | null }[] | null;
      const rel = r.client as ClientRel;
      const clientRow = Array.isArray(rel) ? rel[0] : rel;
      const agency: AgencyBrand =
        opts.agencyOverride ??
        (clientRow?.agency?.toLowerCase().includes('anderson') || clientRow?.agency?.toLowerCase() === 'ac'
          ? 'anderson'
          : 'nativz');
      recipients.push({
        contact_id: r.id,
        email: r.email,
        full_name: r.full_name,
        first_name: r.first_name,
        agency,
        client_name: clientRow?.name ?? null,
        client_id: r.client_id,
      });
    }
  }

  if (opts.portalOnly) {
    let userQuery = admin
      .from('users')
      .select(`
        id, email, full_name, organization_id,
        user_client_access!inner ( client_id, clients ( id, name, agency ) )
      `)
      .eq('role', 'viewer');
    if (opts.clientId) {
      userQuery = userQuery.eq('user_client_access.client_id', opts.clientId);
    }
    const { data: users } = await userQuery;
    for (const u of users ?? []) {
      if (!u.email) continue;
      type AccessRow = {
        client_id: string;
        clients: { id: string; name: string | null; agency: string | null } | { id: string; name: string | null; agency: string | null }[] | null;
      };
      const accessRows = u.user_client_access as AccessRow[] | null;
      const access = accessRows?.[0];
      const accessClient = Array.isArray(access?.clients) ? access?.clients[0] : access?.clients;
      const agency: AgencyBrand =
        opts.agencyOverride ??
        (accessClient?.agency?.toLowerCase().includes('anderson') || accessClient?.agency?.toLowerCase() === 'ac'
          ? 'anderson'
          : 'nativz');
      recipients.push({
        contact_id: null,
        email: u.email,
        full_name: u.full_name,
        first_name: null,
        agency,
        client_name: accessClient?.name ?? null,
        client_id: access?.client_id ?? null,
      });
    }
  }

  // Dedupe by email
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function layoutForAgency(body: string, agency: AgencyBrand) {
  return layout(body, agency);
}
