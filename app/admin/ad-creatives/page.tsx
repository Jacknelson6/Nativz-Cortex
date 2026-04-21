import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';
import { AdGeneratorWorkspace } from '@/components/ad-creatives/ad-generator-workspace';
import type { AdPromptTemplate } from '@/components/ad-creatives/ad-template-library';
import type { AdConcept } from '@/components/ad-creatives/ad-concept-gallery';

/**
 * Ad Generator — replaces the old dev-facing form-page with a chat-led
 * workspace for admins. Phase 1: tab shell + per-client asset library.
 * Phase 2 wires the chat + gallery + template-image-to-JSON extraction.
 *
 * URL stays at /admin/ad-creatives; the top-bar brand pill drives which
 * client's workspace renders. Legacy /admin/ad-creatives-v2/<uuid> URLs
 * are handled by middleware (see middleware.ts:LEGACY_AD_CREATIVES_CLIENT_ID).
 */
export default async function AdCreativesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const active = await getActiveAdminClient().catch(() => null);

  // No brand pinned → same gentle empty state pattern as analytics.
  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter py-8 space-y-4">
        <h1 className="ui-page-title">Ad Generator</h1>
        <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            Pick a brand in the top-bar pill to open its ad-generator workspace.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const clientId = active.brand.id;

  // Parallel: every read the workspace needs on first paint. Concept list
  // is the most expensive (up to hundreds of rows), but even at 500 it's a
  // sub-100ms query with the (client_id, created_at DESC) index.
  const [clientResult, assetResult, templateResult, conceptResult] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, logo_url, brand_dna_status')
      .eq('id', clientId)
      .maybeSingle(),
    admin
      .from('ad_assets')
      .select('id, kind, label, notes, storage_path, mime_type, byte_size, width, height, tags, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('ad_prompt_templates')
      .select('id, name, reference_image_url, prompt_schema, aspect_ratio, ad_category, tags, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('ad_concepts')
      .select(
        'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const client = clientResult.data;
  if (!client) {
    return (
      <div className="cortex-page-gutter py-8 space-y-4">
        <h1 className="ui-page-title">Ad Generator</h1>
        <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
          <p className="text-sm text-red-400">
            The pinned brand could not be loaded. Pick a different brand in the top-bar pill.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdGeneratorWorkspace
      clientId={client.id}
      clientName={client.name ?? ''}
      clientSlug={client.slug ?? ''}
      brandDnaStatus={client.brand_dna_status ?? 'none'}
      initialAssets={assetResult.data ?? []}
      initialTemplates={(templateResult.data ?? []) as AdPromptTemplate[]}
      initialConcepts={(conceptResult.data ?? []) as AdConcept[]}
    />
  );
}
