import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const maxDuration = 60;

const ADMIN_ROLES: string[] = ['admin', 'super_admin'];

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const StartAuditSchema = z.object({
  website_url: z
    .string()
    .min(1, 'Website URL is required')
    .transform((v, ctx) => {
      const normalized = normalizeWebsiteUrl(v);
      if (!normalized) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid website URL' });
        return z.NEVER;
      }
      return normalized;
    }),
  social_urls: z.record(z.string(), z.string()).optional(),
  tiktok_url: z.string().optional(),
  // Optional pre-attach — picker now lives on the entry screen so the
  // post-completion step can auto-create a client_benchmarks row without
  // a second confirm-platforms click.
  attached_client_id: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/analyze-social — Start a new prospect audit
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = StartAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify admin role
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const attachedClientId = parsed.data.attached_client_id ?? null;
    if (attachedClientId) {
      const { data: client } = await adminClient
        .from('clients')
        .select('id, is_active')
        .eq('id', attachedClientId)
        .maybeSingle();
      if (!client || !client.is_active) {
        return NextResponse.json(
          { error: 'Selected client is not accessible' },
          { status: 400 },
        );
      }
    }

    const { data: audit, error } = await adminClient
      .from('prospect_audits')
      .insert({
        website_url: parsed.data.website_url,
        tiktok_url: parsed.data.tiktok_url ?? parsed.data.social_urls?.tiktok ?? '',
        social_urls: parsed.data.social_urls ?? {},
        status: 'pending',
        attached_client_id: attachedClientId,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !audit) {
      console.error('Create audit error:', error);
      return NextResponse.json({ error: 'Failed to create audit' }, { status: 500 });
    }

    return NextResponse.json({ id: audit.id });
  } catch (error) {
    console.error('POST /api/analyze-social error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/analyze-social — List all audits
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: auditRows } = await adminClient
      .from('prospect_audits')
      .select(
        'id, website_url, tiktok_url, status, created_at, prospect_data, scorecard, attached_client:attached_client_id(name)',
      )
      .order('created_at', { ascending: false })
      .limit(50);

    const audits = (auditRows ?? []).map((row) => {
      const { attached_client, ...rest } = row as typeof row & {
        attached_client?: { name: string | null } | { name: string | null }[] | null;
      };
      const attached = Array.isArray(attached_client) ? attached_client[0] : attached_client;
      return {
        ...rest,
        attached_client_name: attached?.name ?? null,
      };
    });

    return NextResponse.json({ audits });
  } catch (error) {
    console.error('GET /api/analyze-social error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/analyze-social — Delete an audit
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const auditId = new URL(request.url).searchParams.get('id');
    if (!auditId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await adminClient.from('prospect_audits').delete().eq('id', auditId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/analyze-social error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
