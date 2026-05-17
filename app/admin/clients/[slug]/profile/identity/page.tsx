import { notFound } from 'next/navigation';
import { IdCard } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  VoiceEditor,
  CaptionsEditor,
  ProductsEditor,
  AliasesEditor,
} from '@/components/clients/profile/identity-editors';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
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
        'id', 'brand_voice', 'target_audience', 'writing_style',
        'banned_phrases', 'caption_cta', 'caption_hashtags',
        'caption_notes', 'hashtag_notes', 'cta_notes',
        'products', 'brand_aliases',
      ].join(','),
    )
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  return (
    <>
      <SettingsPageHeader
        eyebrow="Brand profile"
        icon={IdCard}
        title="Identity"
        subtitle="Voice, captions, products, and the aliases the AI needs to draft as this brand. Edit basics from Overview."
      />

      <VoiceEditor
        clientId={client.id}
        initial={{
          brand_voice: client.brand_voice ?? '',
          target_audience: client.target_audience ?? '',
          writing_style: client.writing_style ?? '',
          banned_phrases: client.banned_phrases ?? [],
        }}
      />

      <CaptionsEditor
        clientId={client.id}
        initial={{
          caption_cta: client.caption_cta ?? '',
          caption_hashtags: client.caption_hashtags ?? [],
          caption_notes: client.caption_notes ?? '',
          hashtag_notes: client.hashtag_notes ?? '',
          cta_notes: client.cta_notes ?? '',
        }}
      />

      <ProductsEditor
        clientId={client.id}
        initial={{ products: client.products ?? [] }}
      />

      <AliasesEditor
        clientId={client.id}
        initial={{ brand_aliases: client.brand_aliases ?? [] }}
      />
    </>
  );
}
