import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/v1/clients/[id]
 *
 * Fetch a single client by UUID or slug, with associated contacts.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Client UUID or slug
 * @returns {{ client: Client, contacts: Contact[] }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  // Support both UUID and slug lookup
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const { data: client, error } = await admin
    .from('clients')
    .select('id, name, slug, industry, organization_id, logo_url, website_url, target_audience, brand_voice, topic_keywords, is_active, health_score, agency, services, description')
    .eq(isUuid ? 'id' : 'slug', id)
    .single();

  if (error || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Fetch contacts
  const { data: contacts } = await admin
    .from('contacts')
    .select('id, full_name, email, phone, role, is_primary')
    .eq('client_id', client.id);

  return NextResponse.json({
    client,
    contacts: contacts ?? [],
  });
}
