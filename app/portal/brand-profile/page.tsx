import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { BrandProfileView, type BrandProfileData } from '@/components/clients/brand-profile-view';
import { PageError } from '@/components/shared/page-error';

export const dynamic = 'force-dynamic';

/**
 * /portal/brand-profile — client-visible brand profile. Same
 * <BrandProfileView/> as admin, minus the "Edit in settings" CTA.
 * All the sections the client is allowed to see in one clean scroll.
 */
export default async function PortalBrandProfilePage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;
    const admin = createAdminClient();

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
        .eq('id', client.id)
        .maybeSingle(),
      admin
        .from('client_knowledge_entries')
        .select('metadata, updated_at')
        .eq('client_id', client.id)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // See note in app/admin/brand-profile/page.tsx — long select string
    // defeats supabase-js type inference, so we downcast.
    const raw = clientResult.data as Record<string, unknown> | null;
    if (!raw) return <PageError title="Could not load brand" />;

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

    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <BrandProfileView
          profile={profile}
          dnaMetadata={dnaMetadata}
          dnaUpdatedAt={dnaUpdatedAt}
          editHref={null}
        />
      </div>
    );
  } catch (err) {
    console.error('PortalBrandProfilePage error:', err);
    return <PageError />;
  }
}
