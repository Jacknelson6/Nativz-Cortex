import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  brand_name: z.string().trim().min(1).max(200).optional(),
  website_url: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  handles: z
    .object({
      instagram: z.string().trim().max(200).nullable().optional(),
      tiktok: z.string().trim().max(200).nullable().optional(),
      facebook: z.string().trim().max(200).nullable().optional(),
      youtube: z.string().trim().max(200).nullable().optional(),
    })
    .optional(),
});

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;

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

function buildCanonicalProfileUrl(platform: string, handle: string): string {
  const h = handle.replace(/^@+/, '');
  switch (platform) {
    case 'instagram': return `https://instagram.com/${h}`;
    case 'tiktok':    return `https://tiktok.com/@${h}`;
    case 'facebook':  return `https://facebook.com/${h}`;
    case 'youtube':   return `https://youtube.com/@${h}`;
    default:          return `https://${h}`;
  }
}

/**
 * PATCH /api/clients/[id]/competitors/[competitorId]
 *
 * Update a competitor brand and/or its per-platform handles. For each
 * platform in the `handles` payload:
 *   - non-empty string → upsert the platform row (update handle)
 *   - null / empty string → delete the platform row (clear that handle)
 *   - key absent → leave that platform's row untouched
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; competitorId: string }> },
) {
  try {
    const { id: clientId, competitorId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Ownership check — route is nested under a specific client so we
    // must verify this competitor belongs to that client.
    const { data: parent } = await adminClient
      .from('competitors')
      .select('id, client_id')
      .eq('id', competitorId)
      .maybeSingle();
    if (!parent || parent.client_id !== clientId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Parent-row updates (brand_name, website_url, notes).
    const parentPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.brand_name !== undefined) parentPatch.brand_name = parsed.data.brand_name.trim();
    if (parsed.data.website_url !== undefined)
      parentPatch.website_url = parsed.data.website_url?.trim() || null;
    if (parsed.data.notes !== undefined)
      parentPatch.notes = parsed.data.notes?.trim() || null;

    if (Object.keys(parentPatch).length > 1) {
      const { error } = await adminClient
        .from('competitors')
        .update(parentPatch)
        .eq('id', competitorId);
      if (error) {
        console.error('competitors:PATCH parent error', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }
    }

    // Per-platform handle upsert/delete.
    if (parsed.data.handles) {
      for (const platform of PLATFORMS) {
        const value = parsed.data.handles[platform];
        if (value === undefined) continue; // key absent — skip
        const clean = value?.trim() || '';

        // Fetch the existing row (if any) so we know whether to update
        // or insert vs delete.
        const { data: existing } = await adminClient
          .from('client_competitors')
          .select('id')
          .eq('competitor_id', competitorId)
          .eq('platform', platform)
          .maybeSingle();

        if (clean.length === 0) {
          if (existing) {
            await adminClient.from('client_competitors').delete().eq('id', existing.id);
          }
          continue;
        }

        const profileUrl = buildCanonicalProfileUrl(platform, clean);
        if (existing) {
          await adminClient
            .from('client_competitors')
            .update({ username: clean, profile_url: profileUrl })
            .eq('id', existing.id);
        } else {
          await adminClient.from('client_competitors').insert({
            client_id: clientId,
            competitor_id: competitorId,
            platform,
            profile_url: profileUrl,
            username: clean,
            website_scraped: false,
            added_by: user.id,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('competitors:PATCH fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/competitors/[competitorId]
 *
 * Hard-delete the competitor brand. ON DELETE CASCADE on
 * client_competitors.competitor_id removes the per-platform rows too.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; competitorId: string }> },
) {
  try {
    const { id: clientId, competitorId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data: parent } = await adminClient
      .from('competitors')
      .select('id, client_id')
      .eq('id', competitorId)
      .maybeSingle();
    if (!parent || parent.client_id !== clientId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await adminClient
      .from('competitors')
      .delete()
      .eq('id', competitorId);
    if (error) {
      console.error('competitors:DELETE error', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('competitors:DELETE fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
