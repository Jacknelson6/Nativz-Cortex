import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey } from '@/lib/api-keys/generate';
import { logActivity } from '@/lib/activity';
import { viewerMayUseRestApi } from '@/lib/portal/viewer-api-access';

const VALID_SCOPES = ['tasks', 'clients', 'shoots', 'scheduler', 'search', 'team', 'calendar'] as const;

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expires_at: z.string().datetime().optional(),
});

/**
 * GET /api/api-keys
 *
 * List all API keys for the authenticated user. Returns key metadata but NOT the actual
 * plaintext key (which is only shown once at creation time).
 *
 * @auth Required (any authenticated user)
 * @returns {{ keys: ApiKey[] }} Array of API key metadata records
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await viewerMayUseRestApi(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: 'API access is disabled for your organization. Contact your Nativz team.' },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const { data: keys, error } = await admin
      .from('api_keys')
      .select('id, name, key_prefix, scopes, is_active, last_used_at, created_at, expires_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    return NextResponse.json({ keys: keys ?? [] });
  } catch (error) {
    console.error('GET /api/api-keys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/api-keys
 *
 * Create a new API key for the authenticated user. Generates a secure random key,
 * stores only a bcrypt hash and prefix in the database, and returns the plaintext key
 * once — it cannot be recovered later.
 *
 * @auth Required (any authenticated user)
 * @body name - Human-readable key name (required, max 100 chars)
 * @body scopes - Array of allowed scope strings (tasks | clients | shoots | scheduler | search | team | calendar; at least one required)
 * @body expires_at - Optional ISO datetime for key expiration
 * @returns {{ key: ApiKey & { plaintext: string } }} Key metadata plus the one-time plaintext (201)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await viewerMayUseRestApi(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: 'API access is disabled for your organization. Contact your Nativz team.' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = createKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const { plaintext, hash, prefix } = generateApiKey();
    const admin = createAdminClient();

    const { data: key, error } = await admin
      .from('api_keys')
      .insert({
        user_id: user.id,
        key_hash: hash,
        key_prefix: prefix,
        name: parsed.data.name,
        scopes: parsed.data.scopes,
        expires_at: parsed.data.expires_at ?? null,
      })
      .select('id, name, key_prefix, scopes, is_active, created_at, expires_at')
      .single();

    if (error) {
      console.error('POST /api/api-keys error:', error);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    // Audit log: API key creation
    logActivity(user.id, 'api_key_created', 'api_key', key.id, {
      key_name: parsed.data.name,
      key_prefix: prefix,
      scopes: parsed.data.scopes,
      expires_at: parsed.data.expires_at ?? null,
    }).catch(() => {});

    // Return plaintext key ONCE
    return NextResponse.json({ key: { ...key, plaintext } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/api-keys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
