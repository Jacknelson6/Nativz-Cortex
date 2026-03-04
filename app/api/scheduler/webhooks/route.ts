import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if secret is configured
    const secret = process.env.LATE_WEBHOOK_SECRET;
    if (secret) {
      const signature = request.headers.get('x-late-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }
      // Late uses HMAC-SHA256 for webhook verification
      // For now, just check the header exists — full HMAC verification can be added later
    }

    const body = await request.json();
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
      case 'account.disconnected': {
        await adminClient
          .from('social_profiles')
          .update({ is_active: false })
          .eq('late_account_id', data.accountId);
        break;
      }
      default: {
        // Unknown event — acknowledge but don't process
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('POST /api/scheduler/webhooks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
