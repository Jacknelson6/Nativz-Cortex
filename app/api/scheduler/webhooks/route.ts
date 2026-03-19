import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/scheduler/webhooks
 *
 * Receive Late API webhooks and update scheduled post statuses accordingly.
 * Handles post.published, post.failed, post.scheduled, post.partial_publish,
 * account.connected, and account.disconnected events. Verifies LATE_WEBHOOK_SECRET
 * header if configured.
 *
 * @auth Bearer LATE_WEBHOOK_SECRET (optional — if LATE_WEBHOOK_SECRET env var is set)
 * @returns {{ received: true }}
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook HMAC-SHA256 signature
    const secret = process.env.LATE_WEBHOOK_SECRET;
    const rawBody = await request.text();

    if (secret) {
      const signature = request.headers.get('x-late-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
      const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
      const actual = signature.replace(/^sha256=/, '');
      // Constant-time comparison to prevent timing attacks
      const a = encoder.encode(expected);
      const b = encoder.encode(actual);
      if (a.byteLength !== b.byteLength) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      let diff = 0;
      for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
      if (diff !== 0) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const body = JSON.parse(rawBody);
    const { event, data } = body;
    const adminClient = createAdminClient();

    switch (event) {
      case 'post.published': {
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'published' })
          .eq('late_post_id', data.postId);
        break;
      }
      case 'post.failed': {
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'failed' })
          .eq('late_post_id', data.postId);
        break;
      }
      case 'post.scheduled': {
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'scheduled' })
          .eq('late_post_id', data.postId);
        break;
      }
      case 'post.partial_publish': {
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'partially_failed' })
          .eq('late_post_id', data.postId);
        break;
      }
      case 'account.connected': {
        // Re-sync profiles when a new account is connected
        await adminClient
          .from('social_profiles')
          .update({ is_active: true })
          .eq('late_account_id', data.accountId);
        break;
      }
      case 'account.disconnected': {
        await adminClient
          .from('social_profiles')
          .update({ is_active: false })
          .eq('late_account_id', data.accountId);
        break;
      }
      default: {
        // message.received, comment.received — log for now
        console.log(`Late webhook: ${event}`, data);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('POST /api/scheduler/webhooks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
