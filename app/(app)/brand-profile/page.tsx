import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { BrandProfileInlineEditor } from '@/components/clients/brand-profile-inline-editor';
import { LinkedSocialsSection } from '@/components/clients/linked-socials-section';
import { PageError } from '@/components/shared/page-error';
import { Building, Megaphone } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * /brand-profile — single page used by both admin and viewer. Reads
 * whichever brand is pinned in the session pill. The same component
 * tree renders in both roles; admin adds inline-edit affordances
 * (per-section pencil, Save/Cancel, Generate-with-AI, URL inputs,
 * BrandDNA per-tile editors). Viewer mode flips `readOnly`/`editable`
 * flags on each component so the layout, tokens, and section shells
 * stay identical — the page just becomes information-only.
 */
export default async function BrandProfilePage() {
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

    const clientResult = await admin
      .from('clients')
      .select(
        'id, name, logo_url, website_url, description, industry, brand_voice, target_audience, tagline, value_proposition, mission_statement',
      )
      .eq('id', clientId)
      .maybeSingle();

    const raw = clientResult.data as Record<string, unknown> | null;
    if (!raw) return <PageError title="Could not load brand" />;

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
        {/* Header + essence are editable for both admin and portal
            viewers (jack 2026-05-14): brand profile is the client's own
            source of truth, so they should be able to update it from
            their side. Scoping is enforced inside the PATCH route. */}
        <BrandProfileInlineEditor profile={profile} />

        {/* Social presence — admin gets URL inputs; viewer sees static
            link rows for any linked accounts. */}
        <section className="rounded-xl border border-nativz-border bg-surface p-6 max-md:p-4">
          <header className="flex items-start gap-3">
            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
              <Megaphone size={16} />
            </div>
            <h2 className="text-sm font-semibold text-text-primary pt-1.5">Social presence</h2>
          </header>
          <div className="mt-5">
            <LinkedSocialsSection clientId={clientId} readOnly={!isAdmin} />
          </div>
        </section>
      </div>
    );
  } catch (err) {
    console.error('BrandProfilePage error:', err);
    return <PageError />;
  }
}
