import { notFound } from 'next/navigation';
import { IdCard } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientLogo } from '@/components/clients/client-logo';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WorkspaceSection,
  WorkspaceRow,
} from '@/components/clients/profile/workspace-section';
import {
  BasicsEditor,
  VoiceEditor,
  CaptionsEditor,
  ProductsEditor,
  AliasesEditor,
} from '@/components/clients/profile/identity-editors';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  name: string | null;
  slug: string | null;
  industry: string | null;
  website_url: string | null;
  logo_url: string | null;
  description: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  writing_style: string | null;
  banned_phrases: string[] | null;
  caption_cta: string | null;
  caption_hashtags: string[] | null;
  caption_notes: string | null;
  hashtag_notes: string | null;
  cta_notes: string | null;
  products: string[] | null;
  brand_aliases: string[] | null;
};

function cleanUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

function preview(value: string | null, max = 220): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export default async function ProfileIdentityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select(
      [
        'id', 'name', 'slug', 'industry', 'website_url', 'logo_url',
        'description', 'brand_voice', 'target_audience', 'writing_style',
        'banned_phrases', 'caption_cta', 'caption_hashtags',
        'caption_notes', 'hashtag_notes', 'cta_notes',
        'products', 'brand_aliases',
      ].join(','),
    )
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  const products = client.products ?? [];
  const aliases = client.brand_aliases ?? [];
  const banned = client.banned_phrases ?? [];
  const hashtags = client.caption_hashtags ?? [];

  return (
    <>
      <SettingsPageHeader
        icon={IdCard}
        title="Identity"
        subtitle="The brand's name, voice, products, and the captions we paste under every post."
      />

      <WorkspaceSection
        title="Basics"
        anchor="basics"
        action={
          <BasicsEditor
            clientId={client.id}
            initial={{
              name: client.name ?? '',
              website_url: client.website_url ?? '',
              industry: client.industry ?? '',
              description: client.description ?? '',
            }}
          />
        }
      >
        <WorkspaceRow label="Brand name" value={client.name} />
        <WorkspaceRow
          label="Website"
          value={
            client.website_url ? (
              <a
                href={client.website_url}
                target="_blank"
                rel="noreferrer"
                className="text-accent-text hover:underline"
              >
                {cleanUrl(client.website_url)}
              </a>
            ) : null
          }
        />
        <WorkspaceRow label="Industry" value={client.industry} />
        <WorkspaceRow
          label="Logo"
          rightSlot={
            <ClientLogo src={client.logo_url} name={client.name ?? slug} size="md" />
          }
        />
        <WorkspaceRow
          label="Description"
          value={preview(client.description, 260)}
          multiline
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Voice & audience"
        anchor="voice"
        action={
          <VoiceEditor
            clientId={client.id}
            initial={{
              brand_voice: client.brand_voice ?? '',
              target_audience: client.target_audience ?? '',
              writing_style: client.writing_style ?? '',
              banned_phrases: banned,
            }}
          />
        }
      >
        <WorkspaceRow
          label="Brand voice"
          value={preview(client.brand_voice, 200)}
          multiline
        />
        <WorkspaceRow
          label="Target audience"
          value={preview(client.target_audience, 200)}
          multiline
        />
        <WorkspaceRow
          label="Writing style"
          value={preview(client.writing_style, 200)}
          multiline
        />
        <WorkspaceRow
          label="Banned phrases"
          value={banned.length > 0 ? `${banned.length} saved` : null}
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Captions"
        anchor="captions"
        action={
          <CaptionsEditor
            clientId={client.id}
            initial={{
              caption_cta: client.caption_cta ?? '',
              caption_hashtags: hashtags,
              caption_notes: client.caption_notes ?? '',
              hashtag_notes: client.hashtag_notes ?? '',
              cta_notes: client.cta_notes ?? '',
            }}
          />
        }
      >
        <WorkspaceRow label="CTA" value={client.caption_cta} />
        <WorkspaceRow
          label="Hashtags"
          value={
            hashtags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {hashtags.slice(0, 12).map((h) => (
                  <span
                    key={h}
                    className="rounded-full border border-nativz-border bg-background px-2 py-0.5 text-xs text-text-secondary"
                  >
                    #{h}
                  </span>
                ))}
                {hashtags.length > 12 && (
                  <span className="text-xs text-text-muted">+{hashtags.length - 12} more</span>
                )}
              </div>
            ) : null
          }
        />
        <WorkspaceRow
          label="Caption notes"
          value={preview(client.caption_notes, 180)}
          multiline
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Products"
        anchor="products"
        description="Products the AI should weight when generating scripts and captions."
        action={<ProductsEditor clientId={client.id} initial={{ products }} />}
      >
        {products.length === 0 ? (
          <WorkspaceRow label="No products yet" />
        ) : (
          products.map((p) => <WorkspaceRow key={p} label={p} />)
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title="Brand aliases"
        anchor="aliases"
        description="Alternate names + spellings used for this brand."
        action={<AliasesEditor clientId={client.id} initial={{ brand_aliases: aliases }} />}
      >
        {aliases.length === 0 ? (
          <WorkspaceRow label="No aliases yet" />
        ) : (
          aliases.map((a) => <WorkspaceRow key={a} label={a} />)
        )}
      </WorkspaceSection>
    </>
  );
}
