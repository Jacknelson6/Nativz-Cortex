import Image from 'next/image';
import Link from 'next/link';
import { Building, Globe, Pencil } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';
import { BrandProfileSocialsView } from '@/components/clients/brand-profile-socials-view';
import { BrandProfileCompetitorsView } from '@/components/clients/brand-profile-competitors-view';
import { PageError } from '@/components/shared/page-error';

export const dynamic = 'force-dynamic';

/**
 * /admin/brand-profile — admin-side mirror of the portal brand profile.
 * Renders whichever brand is pinned in the session pill. If no brand is
 * pinned, shows a friendly prompt to pick one rather than an error.
 *
 * The admin view re-uses the portal's read-only view components (socials
 * + competitors) because the shape we want to show a teammate reviewing
 * a client brand is identical to the shape the client themselves see —
 * no point maintaining two UIs. Editing still happens in the admin
 * settings page at /admin/clients/[slug]/settings/brand, linked at the
 * top of this page.
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

    // Parallel: extra client fields + brand DNA guideline.
    const [clientExtraResult] = await Promise.all([
      admin
        .from('clients')
        .select(
          'description, industry, brand_voice, target_audience, logo_url, website_url, slug, brand_dna_status',
        )
        .eq('id', clientId)
        .maybeSingle(),
    ]);

    const extra = clientExtraResult.data;
    const slug = extra?.slug ?? active.brand.slug;

    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Brand header — with an "Edit in settings" shortcut for admins.
            The portal's header doesn't have this button; everything else
            is identical so the look-and-feel matches. */}
        <header className="rounded-xl border border-nativz-border bg-surface p-6">
          <div className="flex items-start gap-4">
            {extra?.logo_url ? (
              <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-background shrink-0">
                <Image
                  src={extra.logo_url}
                  alt={`${active.brand.name} logo`}
                  fill
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-lg bg-background/50 flex items-center justify-center shrink-0">
                <Building size={24} className="text-text-muted" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold text-text-primary">
                    {active.brand.name ?? 'Brand profile'}
                  </h1>
                  {extra?.website_url && (
                    <a
                      href={extra.website_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-accent-text hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      <Globe size={12} /> {cleanDomain(extra.website_url)}
                    </a>
                  )}
                </div>
                <Link
                  href={`/admin/clients/${slug}/settings/brand`}
                  className="shrink-0 inline-flex items-center gap-1 text-xs rounded-full border border-nativz-border px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover transition"
                >
                  <Pencil size={12} /> Edit in settings
                </Link>
              </div>
              {extra?.description && (
                <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                  {extra.description}
                </p>
              )}
            </div>
          </div>

          {(extra?.industry || extra?.brand_voice || extra?.target_audience) && (
            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-nativz-border">
              {extra?.industry && <Field label="Industry" value={extra.industry} />}
              {extra?.brand_voice && <Field label="Brand voice" value={extra.brand_voice} />}
              {extra?.target_audience && <Field label="Target audience" value={extra.target_audience} />}
            </dl>
          )}
        </header>

        <BrandProfileSocialsView clientId={clientId} />
        <BrandProfileCompetitorsView clientId={clientId} />
      </div>
    );
  } catch (err) {
    console.error('AdminBrandProfilePage error:', err);
    return <PageError />;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {label}
      </dt>
      <dd className="text-sm text-text-primary mt-1">{value}</dd>
    </div>
  );
}

function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}
