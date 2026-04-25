import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { BrandProfileInlineEditor } from '@/components/clients/brand-profile-inline-editor';
import { BrandProfileView, type BrandProfileData } from '@/components/clients/brand-profile-view';
import { LinkedSocialsSection } from '@/components/clients/linked-socials-section';
import { CompetitorsSection } from '@/components/clients/competitors-section';
import { BrandDNAView } from '@/components/brand-dna/brand-dna-view';
import { PageError } from '@/components/shared/page-error';
import { Building, Megaphone, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * /brand-profile — admin-side brand profile. Reads whichever
 * brand is pinned in the session pill. Every section is edit-in-place:
 *   - Header fields (website, description, industry, voice, audience)
 *     auto-save on blur via /api/clients/[id]/brand-profile.
 *   - Essence trio (tagline, value prop, mission) auto-saves on blur
 *     + has a "Generate with AI" button that fills all three.
 *   - Linked social profiles: manage slots (connect Zernio / paste
 *     handle / mark no-account) per platform.
 *   - Competitors: add / edit / delete competitor brands.
 *   - Brand DNA: per-section editor via pencil icons on each tile
 *     (fonts, colors, voice, etc.). Regenerate was removed so manual
 *     refinements don't get overwritten.
 *
 * Portal's `/portal/brand-profile` stays read-only via BrandProfileView.
 * Styles match across both so toggling between read and edit contexts
 * doesn't shift visually.
 */
export default async function AdminBrandProfilePage() {
  try {
    const active = await getActiveBrand().catch(() => null);

    if (!active?.brand) {
      return (
        <div className="max-w-5xl mx-auto p-4 md:p-6">
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
    const isAdmin = active.isAdmin;
    const admin = createAdminClient();

    // Viewers get the read-only `BrandProfileView` (same shape used by the
    // legacy /portal/brand-profile page) which has no inline editor and
    // no per-section pencil icons. Admins keep the inline editor + section
    // pencils. The select list is wider for the viewer view because that
    // component renders extra read-only fields (products, services, etc.).
    const adminFields = [
      'id', 'name', 'slug', 'logo_url', 'website_url', 'description',
      'industry', 'brand_voice', 'target_audience',
      'tagline', 'value_proposition', 'mission_statement',
      'brand_dna_status',
    ];
    const viewerFields = [
      ...adminFields,
      'products', 'services', 'brand_aliases', 'topic_keywords',
      'writing_style', 'ai_image_style', 'banned_phrases', 'content_language',
      'primary_country', 'primary_state', 'primary_city',
      'created_at',
    ];
    const selectFields = (isAdmin ? adminFields : viewerFields).join(',');

    const [clientResult, guidelineResult] = await Promise.all([
      admin
        .from('clients')
        .select(selectFields)
        .eq('id', clientId)
        .maybeSingle(),
      admin
        .from('client_knowledge_entries')
        .select('id, content, metadata, created_at, updated_at')
        .eq('client_id', clientId)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // supabase-js's inference trips on long select strings; cast.
    const raw = clientResult.data as Record<string, unknown> | null;
    if (!raw) return <PageError title="Could not load brand" />;

    const slug = (raw.slug as string | null) ?? active.brand.slug;
    const brandDnaStatus = (raw.brand_dna_status as string | null) ?? 'none';

    // Viewer path — reuse the legacy /portal/brand-profile read-only view.
    // Same data, just no edit affordances. `editHref={null}` hides the
    // "Edit in settings" CTA that admin gets in the section card.
    if (!isAdmin) {
      const profile: BrandProfileData = {
        id: raw.id as string,
        name: (raw.name as string | null) ?? null,
        slug,
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
      const dnaMetadata =
        (guidelineResult.data?.metadata as Record<string, unknown> | null) ?? null;
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
    }

    // Admin path — inline editor + manageable sections.
    const profile = {
      id: raw.id as string,
      name: (raw.name as string | null) ?? null,
      logo_url: (raw.logo_url as string | null) ?? null,
      website_url: (raw.website_url as string | null) ?? null,
      description: (raw.description as string | null) ?? null,
      industry: (raw.industry as string | null) ?? null,
      brand_voice: (raw.brand_voice as string | null) ?? null,
      target_audience: (raw.target_audience as string | null) ?? null,
      tagline: (raw.tagline as string | null) ?? null,
      value_proposition: (raw.value_proposition as string | null) ?? null,
      mission_statement: (raw.mission_statement as string | null) ?? null,
    };

    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        {/* Editable header + essence */}
        <BrandProfileInlineEditor profile={profile} />

        {/* Social presence — no description text per Jack; the
            sub-cards (LinkedSocialsSection, CompetitorsSection) each
            carry their own compact header so a wrapper title suffices. */}
        <section className="rounded-xl border border-nativz-border bg-surface p-6">
          <header className="flex items-start gap-3">
            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
              <Megaphone size={16} />
            </div>
            <h2 className="text-sm font-semibold text-text-primary pt-1.5">Social presence</h2>
          </header>
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LinkedSocialsSection clientId={clientId} />
            <CompetitorsSection clientId={clientId} />
          </div>
        </section>

        {/* Brand DNA — matching card shell. Internal BrandDNAView
            drops its own title/arrow/updated header per the polish
            pass; we provide the section header here. */}
        <section className="rounded-xl border border-nativz-border bg-surface p-6">
          <header className="flex items-start gap-3 mb-5">
            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
              <Sparkles size={16} />
            </div>
            <h2 className="text-sm font-semibold text-text-primary pt-1.5">Brand DNA</h2>
          </header>
          <BrandDNAView
            clientId={clientId}
            clientName={profile.name ?? ''}
            clientSlug={slug ?? ''}
            websiteUrl={profile.website_url ?? ''}
            brandDnaStatus={brandDnaStatus}
            guideline={guidelineResult.data}
          />
        </section>
      </div>
    );
  } catch (err) {
    console.error('AdminBrandProfilePage error:', err);
    return <PageError />;
  }
}
