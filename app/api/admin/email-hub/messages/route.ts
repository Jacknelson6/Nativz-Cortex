import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const STATUS_FILTERS = new Set([
  'draft',
  'scheduled',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'complained',
  'replied',
  'opened',
]);

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const campaignId = searchParams.get('campaign');
  const replyFilter = searchParams.get('replies');
  const domain = searchParams.get('domain');
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500);

  const admin = createAdminClient();

  let query = admin
    .from('email_messages')
    .select(`
      id, campaign_id, contact_id, recipient_email, agency, from_address,
      subject, resend_id, status,
      scheduled_for, sent_at, delivered_at, opened_at, last_opened_at, open_count,
      clicked_at, last_clicked_at, click_count,
      replied_at, bounced_at, failed_at, unsubscribed_at, failure_reason,
      created_at,
      campaign:campaign_id ( id, name ),
      contact:contact_id ( id, email, full_name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && STATUS_FILTERS.has(status)) {
    if (status === 'replied') query = query.not('replied_at', 'is', null);
    else if (status === 'opened') query = query.not('opened_at', 'is', null);
    else query = query.eq('status', status);
  }
  if (campaignId) query = query.eq('campaign_id', campaignId);
  if (replyFilter === 'yes') query = query.not('replied_at', 'is', null);
  if (replyFilter === 'no') query = query.is('replied_at', null);
  if (domain) query = query.ilike('recipient_email', `%@${domain}%`);

  const { data, error } = await query;
  if (error) {
    console.warn('[email-hub/messages] list failed:', error);
    return NextResponse.json({ error: 'Failed to load emails' }, { status: 500 });
  }

  // Stats (unfiltered — represents the whole hub)
  const { data: statsRows } = await admin
    .from('email_messages')
    .select('status, opened_at, replied_at, unsubscribed_at, bounced_at');

  const stats = {
    draft: 0,
    scheduled: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    replied: 0,
    unsubscribed: 0,
    bounced: 0,
    failed: 0,
    totalSent: 0,
  };
  for (const row of statsRows ?? []) {
    if (row.status === 'draft') stats.draft += 1;
    else if (row.status === 'scheduled') stats.scheduled += 1;
    else if (row.status === 'sent') stats.sent += 1;
    else if (row.status === 'delivered') stats.delivered += 1;
    else if (row.status === 'bounced') stats.bounced += 1;
    else if (row.status === 'failed') stats.failed += 1;
    else if (row.status === 'complained') stats.unsubscribed += 1;

    if (row.opened_at) stats.opened += 1;
    if (row.replied_at) stats.replied += 1;
    if (row.unsubscribed_at) stats.unsubscribed += 1;

    if (row.status === 'sent' || row.status === 'delivered') stats.totalSent += 1;
  }

  const openRate = stats.totalSent > 0 ? (stats.opened / stats.totalSent) * 100 : 0;
  const replyRate = stats.totalSent > 0 ? (stats.replied / stats.totalSent) * 100 : 0;
  const bounceRate = stats.totalSent > 0 ? (stats.bounced / stats.totalSent) * 100 : 0;

  return NextResponse.json({
    messages: data ?? [],
    stats: { ...stats, openRate, replyRate, bounceRate },
  });
}
