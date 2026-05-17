import { notFound } from 'next/navigation';
import { Plug } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WebhooksEditor,
  UpPromoteEditor,
  SocialAccountsEditor,
} from '@/components/clients/profile/integrations-editors';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  uppromote_api_key: string | null;
  revision_webhook_url: string | null;
  chat_webhook_url: string | null;
  paid_media_webhook_url: string | null;
};

type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';

type SocialRow = {
  platform: string;
  handle: string | null;
  connection_status: ConnectionStatus | null;
  connected_via: string | null;
};

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'x'];

function maskKey(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default async function ProfileIntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select(
      'id, uppromote_api_key, revision_webhook_url, chat_webhook_url, paid_media_webhook_url',
    )
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  const { data: socialRows } = await admin
    .from('client_social_accounts')
    .select('platform, handle, connection_status, connected_via')
    .eq('client_id', client.id);

  const initialSocial: Record<string, SocialRow> = {};
  for (const row of (socialRows ?? []) as SocialRow[]) {
    initialSocial[row.platform] = row;
  }

  const upPromoteConnected = Boolean(client.uppromote_api_key);

  return (
    <>
      <SettingsPageHeader
        icon={Plug}
        title="Integrations"
        subtitle="Where Cortex pulls data from and pushes events to. Edit inline, save per section."
      />

      <SocialAccountsEditor
        clientId={client.id}
        initial={initialSocial}
        platforms={PLATFORMS}
      />

      <UpPromoteEditor
        clientId={client.id}
        connected={upPromoteConnected}
        maskedKey={maskKey(client.uppromote_api_key)}
      />

      <WebhooksEditor
        clientId={client.id}
        initial={{
          chat_webhook_url: client.chat_webhook_url ?? '',
          revision_webhook_url: client.revision_webhook_url ?? '',
          paid_media_webhook_url: client.paid_media_webhook_url ?? '',
        }}
      />
    </>
  );
}
