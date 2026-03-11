import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashApiKey } from './generate';
import { checkRateLimit } from './rate-limit';

interface ApiKeyContext {
  userId: string;
  keyId: string;
  scopes: string[];
}

const SCOPE_MAP: Record<string, string> = {
  tasks: 'tasks',
  clients: 'clients',
  shoots: 'shoots',
  posts: 'scheduler',
  search: 'search',
  team: 'team',
};

function getScopeFromPath(pathname: string): string | null {
  // /api/v1/tasks/... → "tasks"
  const segment = pathname.replace('/api/v1/', '').split('/')[0];
  return SCOPE_MAP[segment] ?? null;
}

export async function validateApiKey(
  request: NextRequest,
): Promise<{ ctx: ApiKeyContext } | { error: NextResponse }> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 }) };
  }

  const token = auth.slice(7);
  if (!token.startsWith('ntvz_')) {
    return { error: NextResponse.json({ error: 'Invalid API key format' }, { status: 401 }) };
  }

  const hash = hashApiKey(token);
  const admin = createAdminClient();

  const { data: key } = await admin
    .from('api_keys')
    .select('id, user_id, scopes, expires_at')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single();

  if (!key) {
    return { error: NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 }) };
  }

  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'API key expired' }, { status: 401 }) };
  }

  // Check scope
  const requiredScope = getScopeFromPath(request.nextUrl.pathname);
  if (requiredScope && !key.scopes.includes(requiredScope)) {
    return { error: NextResponse.json({ error: `Missing scope: ${requiredScope}` }, { status: 403 }) };
  }

  // Rate limit
  if (!checkRateLimit(key.id)) {
    return { error: NextResponse.json({ error: 'Rate limit exceeded (100/min)' }, { status: 429 }) };
  }

  // Update last_used_at (fire-and-forget)
  admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then(() => {});

  return { ctx: { userId: key.user_id, keyId: key.id, scopes: key.scopes } };
}
