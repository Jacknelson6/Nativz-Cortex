import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';
import { createLateProfile } from '@/lib/posting/late';

const onboardSchema = z.object({
  name: z.string().min(1),
  website_url: z.string().url(),
  industry: z.string().min(1),
  target_audience: z.string().optional().default(''),
  brand_voice: z.string().optional().default(''),
  topic_keywords: z.array(z.string()).optional().default([]),
  logo_url: z.string().nullable().optional().default(null),
  poc_name: z.string().optional().default(''),
  poc_email: z.string().optional().default(''),
  services: z.array(z.string()).optional().default([]),
  agency: z.string().optional().default(''),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { data: clients, error } = await admin
    .from('clients')
    .select('id, name, slug, abbreviation, agency, services, health_score, is_active, industry, website_url, logo_url')
    .order('name');

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }

  return NextResponse.json({ clients: clients ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const parsed = onboardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const data = parsed.data;
  const admin = createAdminClient();

  let slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Check for slug collision
  const { data: existing } = await admin
    .from('clients')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Create organization
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: data.name, slug, type: 'client' })
    .select('id')
    .single();

  if (orgError) {
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }

  // Create client
  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({
      name: data.name,
      slug,
      organization_id: org.id,
      industry: data.industry,
      website_url: data.website_url,
      target_audience: data.target_audience || null,
      brand_voice: data.brand_voice || null,
      topic_keywords: data.topic_keywords,
      logo_url: data.logo_url,
      services: data.services,
      is_active: true,
    })
    .select('id, name, slug, industry, website_url, is_active')
    .single();

  if (clientError) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }

  // Create Late profile for SMM clients (non-blocking)
  if (data.services.includes('SMM') && client) {
    createLateProfile(data.name)
      .then((profileId) =>
        admin.from('clients').update({ late_profile_id: profileId }).eq('id', client.id)
      )
      .catch((err) => console.error('Failed to create Late profile:', err));
  }

  return NextResponse.json({ client }, { status: 201 });
}
