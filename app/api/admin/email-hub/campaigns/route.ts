import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCampaignRecipients, sendCampaign } from '@/lib/email/send-campaign';

export const maxDuration = 60;

const AgencyEnum = z.enum(['nativz', 'anderson']);

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  subject: z.string().min(1).max(300),
  body_markdown: z.string().min(1),
  template_id: z.string().uuid().optional().nullable(),
  agency: AgencyEnum.optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  audience_list_id: z.string().uuid().optional().nullable(),
  audience_portal_only: z.boolean().optional().default(false),
  audience_contact_ids: z.array(z.string().uuid()).optional().default([]),
  // 'draft' | 'send_now' | { schedule: ISO }
  action: z.enum(['draft', 'send_now', 'schedule']).default('draft'),
  scheduled_for: z.string().datetime().optional().nullable(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_campaigns')
    .select(`
      id, name, description, subject, template_id, agency, client_id,
      audience_list_id, audience_portal_only, status, scheduled_for, sent_at,
      total_recipients, sent_count, failed_count, created_at, updated_at,
      client:client_id ( id, name, agency ),
      list:audience_list_id ( id, name )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[email-hub/campaigns] list failed:', error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  if (input.action === 'schedule' && !input.scheduled_for) {
    return NextResponse.json(
      { error: 'scheduled_for is required when action=schedule' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const status =
    input.action === 'send_now'
      ? 'sending'
      : input.action === 'schedule'
      ? 'scheduled'
      : 'draft';

  const { data: campaign, error: createErr } = await admin
    .from('email_campaigns')
    .insert({
      name: input.name,
      description: input.description ?? null,
      subject: input.subject,
      body_markdown: input.body_markdown,
      template_id: input.template_id ?? null,
      agency: input.agency ?? null,
      client_id: input.client_id ?? null,
      audience_list_id: input.audience_list_id ?? null,
      audience_portal_only: input.audience_portal_only ?? false,
      status,
      scheduled_for: input.action === 'schedule' ? input.scheduled_for : null,
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (createErr || !campaign) {
    console.warn('[email-hub/campaigns] create failed:', createErr);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }

  if (input.action === 'send_now') {
    const recipients = await resolveCampaignRecipients(admin, {
      contactIds: input.audience_contact_ids,
      listId: input.audience_list_id,
      portalOnly: input.audience_portal_only,
      agencyOverride: input.agency ?? null,
      clientId: input.client_id,
    });

    if (recipients.length === 0) {
      await admin
        .from('email_campaigns')
        .update({ status: 'failed', failed_count: 0, total_recipients: 0, updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
      return NextResponse.json(
        { error: 'No subscribed recipients matched the selected audience', campaign },
        { status: 400 },
      );
    }

    const result = await sendCampaign({
      admin,
      campaignId: campaign.id,
      subject: input.subject,
      bodyMarkdown: input.body_markdown,
      recipients,
      sender: {
        id: auth.user.id,
        full_name: auth.adminRow.full_name,
        email: auth.adminRow.email,
      },
    });
    return NextResponse.json({ campaign, result }, { status: 201 });
  }

  if (input.action === 'schedule') {
    // Snapshot the recipient set count for UI preview — the cron will re-resolve
    // at send time so late additions still get the email.
    const recipients = await resolveCampaignRecipients(admin, {
      contactIds: input.audience_contact_ids,
      listId: input.audience_list_id,
      portalOnly: input.audience_portal_only,
      agencyOverride: input.agency ?? null,
      clientId: input.client_id,
    });
    await admin
      .from('email_campaigns')
      .update({ total_recipients: recipients.length, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
