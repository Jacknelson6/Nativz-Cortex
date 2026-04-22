import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateBrandContext } from '@/lib/knowledge/brand-context';
import { embedKnowledgeEntry } from '@/lib/ai/embeddings';
import { assertUserCanAccessClient, getUserRoleInfo } from '@/lib/api/client-access';
import {
  mergeProductAppendix,
  buildCanonicalProductCatalogMarkdown,
} from '@/lib/brand-dna/product-catalog-md';
import type { ProductItem } from '@/lib/knowledge/types';

/**
 * GET /api/clients/[id]/brand-dna
 *
 * Return the active brand guideline for a client.
 *
 * @auth Required
 * @returns {{ content, metadata, created_at, updated_at, version, id }}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const access = await assertUserCanAccessClient(admin, user.id, clientId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata, created_at, updated_at')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guideline) {
    return NextResponse.json({ error: 'No brand guideline found' }, { status: 404 });
  }

  const meta = (guideline.metadata as Record<string, unknown>) ?? {};
  return NextResponse.json({
    id: guideline.id,
    content: guideline.content,
    metadata: guideline.metadata,
    created_at: guideline.created_at,
    updated_at: guideline.updated_at,
    version: (meta.version as number) ?? 1,
  });
}

const patchSchema = z.object({
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  section: z.string().optional(),
  sectionContent: z.string().optional(),
});

/**
 * PATCH /api/clients/[id]/brand-dna
 *
 * Update the active brand guideline. Can update full content, metadata, or a single section.
 *
 * @auth Required (admin)
 * @body content - Full markdown replacement
 * @body metadata - Partial metadata merge
 * @body section - Section heading to update (e.g., "Visual identity")
 * @body sectionContent - New content for the specified section
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const roleInfo = await getUserRoleInfo(admin, user.id);
  if (!roleInfo.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  // Find active guideline
  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guideline) {
    return NextResponse.json({ error: 'No brand guideline found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Full content replacement
  if (parsed.data.content) {
    updates.content = parsed.data.content;
  }

  // Section-level update
  if (parsed.data.section && parsed.data.sectionContent !== undefined) {
    const currentContent = guideline.content as string;
    const sectionHeading = `## ${parsed.data.section}`;
    const sectionIdx = currentContent.indexOf(sectionHeading);

    if (sectionIdx === -1) {
      // Section not found — append
      updates.content = `${currentContent}\n\n${sectionHeading}\n${parsed.data.sectionContent}`;
    } else {
      // Find the next section heading
      const afterHeading = currentContent.indexOf('\n## ', sectionIdx + sectionHeading.length);
      const before = currentContent.slice(0, sectionIdx);
      const after = afterHeading !== -1 ? currentContent.slice(afterHeading) : '';
      updates.content = `${before}${sectionHeading}\n${parsed.data.sectionContent}\n${after}`;
    }
  }

  const existingMeta = (guideline.metadata as Record<string, unknown>) ?? {};

  // Metadata merge
  if (parsed.data.metadata) {
    updates.metadata = { ...existingMeta, ...parsed.data.metadata };
  }

  // Keep guideline markdown + product_catalog node in sync when structured products are PATCHed
  if (
    parsed.data.metadata &&
    'products' in parsed.data.metadata &&
    Array.isArray(parsed.data.metadata.products)
  ) {
    const products = parsed.data.metadata.products as ProductItem[];
      const baseContent =
        typeof updates.content === 'string' ? (updates.content as string) : (guideline.content as string);
      updates.content = mergeProductAppendix(baseContent, products);

      const { data: pcRow } = await admin
        .from('client_knowledge_entries')
        .select('id')
        .eq('client_id', clientId)
        .eq('type', 'product_catalog')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pcRow) {
        await admin
          .from('client_knowledge_entries')
          .update({
            content: buildCanonicalProductCatalogMarkdown(products, 'standalone'),
            metadata: { products },
            updated_at: new Date().toISOString(),
          })
          .eq('id', pcRow.id);
      }
  }

  const { error: updateErr } = await admin
    .from('client_knowledge_entries')
    .update(updates)
    .eq('id', guideline.id);

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update guideline' }, { status: 500 });
  }

  invalidateBrandContext(clientId);

  // Re-embed when the searchable surface changed. Without this, semantic
  // search keeps ranking the entry by the old vector — silent regression
  // on every brand DNA edit. Fire-and-forget; a failed embed must not
  // reject the user's save.
  if (typeof updates.content === 'string') {
    embedKnowledgeEntry(guideline.id).catch((err) => {
      console.warn(`[brand-dna PATCH] re-embed failed for ${guideline.id}:`, err);
    });
  }

  return NextResponse.json({ success: true });
}
