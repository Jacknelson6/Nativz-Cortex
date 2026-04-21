import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { BrandSettingsForm } from '@/components/clients/settings/brand-settings-form';
import { BrandDNAView } from '@/components/brand-dna/brand-dna-view';
import { LinkedSocialsSection } from '@/components/clients/linked-socials-section';
import { CompetitorsSection } from '@/components/clients/competitors-section';
import { BrandEssenceSection } from '@/components/clients/brand-essence-section';

export const dynamic = 'force-dynamic';

/**
 * /admin/clients/[slug]/settings/brand — the admin-only, detailed edit
 * surface. Everything configurable about a brand lives here, grouped
 * into clear sections. The client-facing `/portal/brand-profile`
 * mirrors a subset of this (read-only, minus ops-sensitive fields).
 *
 * Layout (top-down):
 *   1. Brand information — name, website, description (existing form)
 *   2. Brand essence — tagline / value prop / mission (AI-assisted)
 *   3. Products, aliases, categories
 *   4. Content generation preferences
 *   5. Default location
 *   6. Social presence — linked profiles + competitors (2 col on lg)
 *   7. Brand DNA — auto-generated brand guideline (if present)
 *
 * `space-y-6` is the standard vertical rhythm between top-level
 * sections; each BrandEssenceSection internally uses `space-y-4` for
 * the cards within it. A thin border-t separator precedes Brand DNA
 * to signal the shift from "brand-data fields" to "AI-distilled brand
 * identity."
 */
export default async function ClientSettingsBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, website_url, brand_dna_status')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  let guideline: {
    id: string;
    content: string;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  } | null = null;
  if (client.brand_dna_status && client.brand_dna_status !== 'none') {
    const { data } = await admin
      .from('client_knowledge_entries')
      .select('id, content, metadata, created_at, updated_at')
      .eq('client_id', client.id)
      .eq('type', 'brand_guideline')
      .is('metadata->superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    guideline = data;
  }

  return (
    // NAT-57 follow-up: constrain the page to a sensible reading
    // width. Client-admin-shell was leaving this full-width, which
    // made long textareas (description, mission) stretch across 2000+px
    // on wide monitors — painful to read and type. max-w-5xl matches
    // the portal brand-profile view so both surfaces share the same
    // layout rhythm.
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 1. Brand information — name, website, description, budget. */}
      <BrandSettingsForm slug={slug} />

      {/* 2-5. Essence, products, content generation, location. This
          component owns its own internal section stack + spacing. */}
      <BrandEssenceSection clientId={client.id} />

      {/* 6. Social presence. Two-column grid on lg+; stacks on smaller
          screens. Wrapped in a header so the pair reads as one section
          rather than two orphaned cards. */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Social presence</h2>
          <p className="text-xs text-text-muted mt-0.5">
            One linked account per platform unlocks analytics; tracked
            competitors auto-suggest in spying tools.
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LinkedSocialsSection clientId={client.id} />
          <CompetitorsSection clientId={client.id} />
        </div>
      </section>

      {/* 7. Brand DNA — the AI-distilled visual + verbal identity. */}
      <BrandDNAView
        clientId={client.id}
        clientName={client.name ?? ''}
        clientSlug={client.slug ?? slug}
        websiteUrl={client.website_url ?? ''}
        brandDnaStatus={client.brand_dna_status ?? 'none'}
        guideline={guideline}
      />
    </div>
  );
}
