import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey } from '@/lib/api-keys/generate';

const VALID_SCOPES = ['tasks', 'clients', 'shoots', 'scheduler', 'search', 'team', 'calendar'] as const;

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expires_at: z.string().datetime().optional(),
});

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Return plaintext key ONCE
    return NextResponse.json({ key: { ...key, plaintext } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/api-keys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
