import { notFound } from 'next/navigation';
import { Plug, Instagram, Music2, Youtube, Facebook, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WorkspaceSection,
  WorkspaceRow,
} from '@/components/clients/profile/workspace-section';
import {
  WebhooksEditor,
  UpPromoteEditor,
} from '@/components/clients/profile/integrations-editors';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  uppromote_api_key: string | null;
  revision_webhook_url: string | null;
  chat_webhook_url: string | null;
  paid_media_webhook_url: string | null;
};

type SocialAccount = {
  platform: string;
  handle: string | null;
  connection_status: string | null;
  connected_via: string | null;
  connected_at: string | null;
};

const PLATFORM_META: Record<string, { label: string; icon: LucideIcon }> = {
  instagram: { label: 'Instagram', icon: Instagram },
  tiktok: { label: 'TikTok', icon: Music2 },
  youtube: { label: 'YouTube', icon: Youtube },
  facebook: { label: 'Facebook', icon: Facebook },
};

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

  // Migration 322 introduces client_social_accounts. Treat as empty if the
  // table isn't there yet (PG error code 42P01 = undefined_table).
  let socialAccounts: SocialAccount[] = [];
  try {
    const { data, error } = await admin
      .from('client_social_accounts')
      .select('platform, handle, connection_status, connected_via, connected_at')
      .eq('client_id', client.id);
    if (!error) socialAccounts = data ?? [];
  } catch {
    socialAccounts = [];
  }

  const accountsByPlatform = new Map<string, SocialAccount>(
    socialAccounts.map((a) => [a.platform, a]),
  );

  const upPromoteConnected = Boolean(client.uppromote_api_key);

  return (
    <>
      <SettingsPageHeader
        icon={Plug}
        title="Integrations"
        subtitle="Where Cortex pulls data from and pushes events to. Connect during onboarding, manage here."
      />

      <WorkspaceSection
        title="Social accounts"
        description="Connected social handles. Used for posting, analytics, and the weekly social digest."
      >
        {Object.entries(PLATFORM_META).map(([key, meta]) => {
          const account = accountsByPlatform.get(key);
          const Icon = meta.icon;
          const isConnected = account?.connection_status === 'connected';
          return (
            <WorkspaceRow
              key={key}
              label={meta.label}
              hint={
                account?.connected_via
                  ? `via ${account.connected_via}`
                  : isConnected
                  ? undefined
                  : 'Not connected'
              }
              value={
                account?.handle ? (
                  <span className="flex items-center gap-2">
                    <Icon size={14} className="text-text-muted" />
                    <span className="font-mono text-xs">@{account.handle}</span>
                    {isConnected ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        Connected
                      </span>
                    ) : account?.connection_status ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        {account.connection_status}
                      </span>
                    ) : null}
                  </span>
                ) : null
              }
            />
          );
        })}
      </WorkspaceSection>

      <WorkspaceSection
        title="Affiliate program"
        description="UpPromote pulls earnings + new affiliate sign-ups for the weekly digest."
        action={<UpPromoteEditor clientId={client.id} connected={upPromoteConnected} />}
      >
        <WorkspaceRow
          label="UpPromote"
          rightSlot={
            <div className="flex items-center gap-2">
              {upPromoteConnected ? (
                <>
                  <Globe size={14} className="text-text-muted" />
                  <span className="font-mono text-xs text-text-secondary">
                    {maskKey(client.uppromote_api_key)}
                  </span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    Connected
                  </span>
                </>
              ) : (
                <span className="text-xs italic text-text-muted">Not connected</span>
              )}
            </div>
          }
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Webhooks"
        description="Where Cortex pushes events. Admin-only — clients never see these."
        action={
          <WebhooksEditor
            clientId={client.id}
            initial={{
              chat_webhook_url: client.chat_webhook_url ?? '',
              revision_webhook_url: client.revision_webhook_url ?? '',
              paid_media_webhook_url: client.paid_media_webhook_url ?? '',
            }}
          />
        }
      >
        <WorkspaceRow
          label="Chat"
          hint="Fires on every approval comment + new drop"
          value={client.chat_webhook_url}
          mono
        />
        <WorkspaceRow
          label="Revisions"
          hint="Fires on revision-requested events"
          value={client.revision_webhook_url}
          mono
        />
        <WorkspaceRow
          label="Paid media"
          hint="Fires when a drop is all-clear for paid"
          value={client.paid_media_webhook_url}
          mono
        />
      </WorkspaceSection>
    </>
  );
}
