import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { OfferSignForm } from './sign-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TierPreview = {
  id: string;
  name: string;
  monthly_cents?: number | null;
  total_cents?: number | null;
  deposit_cents?: number | null;
  cadence?: 'month' | 'year' | 'week' | null;
  subscription?: boolean | null;
  stripe_payment_link?: string | null;
};

export default async function OfferSignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: template } = await admin
    .from('proposal_templates')
    .select('id, agency, name, description, source_folder, public_base_url, tiers_preview, active')
    .eq('source_folder', slug)
    .eq('active', true)
    .maybeSingle();

  if (!template) notFound();

  const tiers = ((template.tiers_preview ?? []) as TierPreview[]).filter((t) => t.id);
  if (tiers.length === 0) notFound();

  const marketingUrl = template.public_base_url
    ? `${template.public_base_url.replace(/\/$/, '')}/${template.source_folder}/`
    : null;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-10 space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {template.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}
          </p>
          <h1 className="text-3xl font-semibold text-text-primary">{template.name}</h1>
          {template.description ? (
            <p className="text-sm text-text-secondary leading-relaxed">{template.description}</p>
          ) : null}
          {marketingUrl ? (
            <p className="text-sm">
              <a
                href={marketingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text hover:underline"
              >
                Read the full proposal →
              </a>
            </p>
          ) : null}
        </div>

        <OfferSignForm
          slug={slug}
          templateId={template.id}
          templateName={template.name}
          agency={(template.agency as 'anderson' | 'nativz') ?? 'anderson'}
          tiers={tiers}
        />
      </div>
    </div>
  );
}
