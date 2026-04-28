import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

// NAT-57 follow-up: unified endpoint for the brand-profile fields that
// surface on the RankPrompt-style view. Covers the essence trio,
// products, brand aliases, content generation preferences, and default
// location. Other brand fields (name, slug, logo_url, website_url,
// description, brand_voice, target_audience) stay on the existing
// /api/clients/[id] endpoint so we don't have two places updating the
// same columns.

const patchSchema = z.object({
  // NAT-57 inline-edit: the header fields are editable right from the
  // brand-profile page now. Route everything through one PATCH so the
  // UI doesn't have to know about two separate endpoints. `name` is
  // the one field that's intentionally NOT here — renaming a client
  // has ripple effects (vault sync, Monday.com, invite emails) handled
  // by the main /api/clients/[id] endpoint. Everything else in this
  // list is safe to write directly.
  website_url: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  industry: z.string().trim().max(200).nullable().optional(),
  brand_voice: z.string().trim().max(500).nullable().optional(),
  target_audience: z.string().trim().max(1000).nullable().optional(),

  // Essence trio — AI-generatable, but free-text editable.
  tagline: z.string().trim().max(500).nullable().optional(),
  value_proposition: z.string().trim().max(1000).nullable().optional(),
  mission_statement: z.string().trim().max(2000).nullable().optional(),

  // Products + aliases + categories.
  products: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  brand_aliases: z.array(z.string().trim().min(1).max(200)).max(50).optional(),

  // Content generation preferences.
  writing_style: z.string().trim().max(2000).nullable().optional(),
  ai_image_style: z.string().trim().max(2000).nullable().optional(),
  banned_phrases: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
  content_language: z.string().trim().min(2).max(10).nullable().optional(),

  // Default location — country required if state/city present. The DB
  // constraint enforces this too, but we validate here for a nicer error.
  primary_country: z.string().trim().max(100).nullable().optional(),
  primary_state: z.string().trim().max(100).nullable().optional(),
  primary_city: z.string().trim().max(100).nullable().optional(),

  // Caption boilerplate appended to every generated content-calendar caption.
  caption_cta: z.string().trim().max(500).nullable().optional(),
  caption_hashtags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || userData.role !== 'admin') return null;
  return user;
}

/**
 * GET /api/clients/[id]/brand-profile
 *
 * Return all the brand-profile fields in one shot. Readable by admins
 * and viewers scoped to the client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const ctx = await getEffectiveAccessContext(user, adminClient);
    if (ctx.clientIds !== null && !ctx.clientIds.includes(clientId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await adminClient
      .from('clients')
      .select(
        [
          // Header / top of profile.
          'name',
          'slug',
          'website_url',
          'logo_url',
          'description',
          'industry',
          'brand_voice',
          'target_audience',
          // Essence trio.
          'tagline',
          'value_proposition',
          'mission_statement',
          // Arrays.
          'services',
          'products',
          'brand_aliases',
          'topic_keywords',
          // Content generation.
          'writing_style',
          'ai_image_style',
          'banned_phrases',
          'content_language',
          // Location.
          'primary_country',
          'primary_state',
          'primary_city',
          // Caption boilerplate.
          'caption_cta',
          'caption_hashtags',
          // Metadata.
          'id',
          'created_at',
        ].join(','),
      )
      .eq('id', clientId)
      .maybeSingle();
    if (error || !data) {
      console.error('brand-profile:GET error', error);
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ profile: data });
  } catch (err) {
    console.error('brand-profile:GET fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/clients/[id]/brand-profile
 *
 * Update one or many brand-profile fields. Only fields included in the
 * body get updated — omit to leave untouched, pass null to clear.
 *
 * @auth Admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Location consistency check — state/city can't exist without country.
    const hasStateOrCity = parsed.data.primary_state || parsed.data.primary_city;
    if (hasStateOrCity && !parsed.data.primary_country) {
      // Fetch existing country to see if the current row would still
      // satisfy the DB constraint after this patch.
      const adminClient = createAdminClient();
      const { data: current } = await adminClient
        .from('clients')
        .select('primary_country')
        .eq('id', clientId)
        .maybeSingle();
      if (!current?.primary_country) {
        return NextResponse.json(
          { error: 'Country is required when state or city is set' },
          { status: 400 },
        );
      }
    }

    // Normalize empty strings → null so we don't store whitespace that
    // would look "present" to later reads.
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (typeof value === 'string') {
        patch[key] = value.trim().length === 0 ? null : value.trim();
      } else if (Array.isArray(value)) {
        // Dedupe + drop empties for array fields.
        patch[key] = Array.from(new Set(value.map((v) => v.trim()).filter(Boolean)));
      } else {
        patch[key] = value;
      }
    }
    patch.updated_at = new Date().toISOString();

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('clients').update(patch).eq('id', clientId);
    if (error) {
      console.error('brand-profile:PATCH error', error);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('brand-profile:PATCH fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
