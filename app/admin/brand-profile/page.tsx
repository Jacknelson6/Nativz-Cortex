import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';
import { BrandProfileView, type BrandProfileData } from '@/components/clients/brand-profile-view';
import { PageError } from '@/components/shared/page-error';
import { Building } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * /admin/brand-profile — admin-side mirror of the portal brand profile.
 * Reads whichever brand is pinned in the session pill. If no brand is
 * pinned, shows a friendly prompt to pick one.
 *
 * Re-uses <BrandProfileView/> with `editHref` set → exposes an "Edit in
 * settings" CTA deep-linking to /admin/clients/[slug]/settings/brand.
 * Portal uses the same component with editHref=null so the layout is
 * visually identical — only the affordances differ.
 */
export default async function AdminBrandProfilePage() {
  try {
    const active = await getActiveAdminClient().catch(() => null);

    if (!active?.brand) {
      return (
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
            <Building className="mx-auto mb-3 text-text-muted" size={32} />
            <h1 className="text-lg font-semibold text-text-primary mb-1">
              No brand pinned
            </h1>
            <p className="text-sm text-text-muted max-w-md mx-auto">
              Pick a brand from the session pill at the top-left of the
              screen to see its brand profile here.
            </p>
          </div>
        </div>
      );
    }

    const clientId = active.brand.id;
    const admin = createAdminClient();

    // Parallel reads: full client profile columns + latest brand DNA
    // guideline. The guideline's jsonb metadata drives the bento cards
    // rendered by BrandDNACards at the bottom of the view.
    const [clientResult, guidelineResult] = await Promise.all([
      admin
        .from('clients')
        .select(
          [
            'id', 'name', 'slug', 'logo_url', 'website_url', 'description',
            'industry', 'brand_voice', 'target_audience',
            'tagline', 'value_proposition', 'mission_statement',
            'products', 'services', 'brand_aliases', 'topic_keywords',
            'writing_style', 'ai_image_style', 'banned_phrases', 'content_language',
            'primary_country', 'primary_state', 'primary_city',
            'created_at',
          ].join(','),
        )
        .eq('id', clientId)
        .maybeSingle(),
      admin
        .from('client_knowledge_entries')
        .select('metadata, updated_at')
        .eq('client_id', clientId)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // supabase-js's generic inference gets confused by our long
    // comma-joined select string and returns `GenericStringError` for
    // `.data` — hence the cast to Record<string, unknown> before we
    // pluck fields. The view component does its own runtime guards so
    // downcasting here is safe.
    const raw = clientResult.data as Record<string, unknown> | null;
    if (!raw) return <PageError title="Could not load brand" />;

    // Cast + fill-in defaults so the view component can rely on arrays
    // being arrays (vs null) — the DB has NOT NULL DEFAULT '{}' but
    // an old row-cast with `unknown` types needs coercion anyway.
    const profile: BrandProfileData = {
      id: raw.id as string,
      name: (raw.name as string | null) ?? null,
      slug: (raw.slug as string | null) ?? null,
      logo_url: (raw.logo_url as string | null) ?? null,
      website_url: (raw.website_url as string | null) ?? null,
      description: (raw.description as string | null) ?? null,
      industry: (raw.industry as string | null) ?? null,
      brand_voice: (raw.brand_voice as string | null) ?? null,
      target_audience: (raw.target_audience as string | null) ?? null,
      tagline: (raw.tagline as string | null) ?? null,
      value_proposition: (raw.value_proposition as string | null) ?? null,
      mission_statement: (raw.mission_statement as string | null) ?? null,
      products: (raw.products as string[] | null) ?? [],
      services: (raw.services as string[] | null) ?? [],
      brand_aliases: (raw.brand_aliases as string[] | null) ?? [],
      topic_keywords: (raw.topic_keywords as string[] | null) ?? [],
      writing_style: (raw.writing_style as string | null) ?? null,
      ai_image_style: (raw.ai_image_style as string | null) ?? null,
      banned_phrases: (raw.banned_phrases as string[] | null) ?? [],
      content_language: (raw.content_language as string | null) ?? null,
      primary_country: (raw.primary_country as string | null) ?? null,
      primary_state: (raw.primary_state as string | null) ?? null,
      primary_city: (raw.primary_city as string | null) ?? null,
      created_at: (raw.created_at as string | null) ?? null,
    };

    const dnaMetadata = (guidelineResult.data?.metadata as Record<string, unknown> | null) ?? null;
    const dnaUpdatedAt = (guidelineResult.data?.updated_at as string | null) ?? null;

    const slug = profile.slug ?? active.brand.slug;
    const editHref = slug ? `/admin/clients/${slug}/settings/brand` : null;

    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <BrandProfileView
          profile={profile}
          dnaMetadata={dnaMetadata}
          dnaUpdatedAt={dnaUpdatedAt}
          editHref={editHref}
        />
      </div>
    );
  } catch (err) {
    console.error('AdminBrandProfilePage error:', err);
    return <PageError />;
  }
}
