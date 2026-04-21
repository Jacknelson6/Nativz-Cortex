import Image from 'next/image';
import { Building, Globe } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { BrandProfileSocialsView } from '@/components/clients/brand-profile-socials-view';
import { BrandProfileCompetitorsView } from '@/components/clients/brand-profile-competitors-view';
import { PortalBrandDNAView } from '@/components/brand-dna/portal-brand-dna-view';
import { PageError } from '@/components/shared/page-error';

export const dynamic = 'force-dynamic';

/**
 * /portal/brand-profile — the client's view of everything we know and
 * track about their brand. Mirrors the admin `brand settings` page but:
 *   - Read-only (clients don't edit here; they ping their Nativz team)
 *   - Hides deep ops fields (billing, admin notes, API keys, access)
 *   - Shows the same Brand DNA view as /portal/brand
 *
 * The layout is a single-column scroll: brand header → social slots →
 * competitors → brand DNA. Kept deliberately light so clients don't feel
 * overwhelmed — the admin brand-settings page is where detail lives.
 */
export default async function PortalBrandProfilePage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;
    const admin = createAdminClient();

    // Parallel reads: brand info (ok, we already have it from getPortalClient,
    // but we need a couple more columns) + brand DNA guideline.
    const [clientExtraResult, guidelineResult] = await Promise.all([
      admin
        .from('clients')
        .select('description, industry, brand_voice, target_audience, logo_url, website_url')
        .eq('id', client.id)
        .maybeSingle(),
      admin
        .from('client_knowledge_entries')
        .select('id, content, metadata, created_at, updated_at')
        .eq('client_id', client.id)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const extra = clientExtraResult.data;
    const guideline = guidelineResult.data;

    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Brand header */}
        <header className="rounded-xl border border-nativz-border bg-surface p-6">
          <div className="flex items-start gap-4">
            {extra?.logo_url ? (
              <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-background shrink-0">
                <Image
                  src={extra.logo_url}
                  alt={`${client.name} logo`}
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
              <h1 className="text-2xl font-semibold text-text-primary">
                {client.name ?? 'Brand profile'}
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
              {extra?.description && (
                <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                  {extra.description}
                </p>
              )}
            </div>
          </div>

          {(extra?.industry || extra?.brand_voice || extra?.target_audience) && (
            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-nativz-border">
              {extra?.industry && (
                <Field label="Industry" value={extra.industry} />
              )}
              {extra?.brand_voice && (
                <Field label="Brand voice" value={extra.brand_voice} />
              )}
              {extra?.target_audience && (
                <Field label="Target audience" value={extra.target_audience} />
              )}
            </dl>
          )}
        </header>

        <BrandProfileSocialsView clientId={client.id} />
        <BrandProfileCompetitorsView clientId={client.id} />

        <PortalBrandDNAView
          clientName={client.name ?? ''}
          guideline={guideline}
        />
      </div>
    );
  } catch (err) {
    console.error('PortalBrandProfilePage error:', err);
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
