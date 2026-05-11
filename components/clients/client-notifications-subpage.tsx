'use client';

import { useEffect, useState } from 'react';
import { Loader2, Bell } from 'lucide-react';
import { AffiliateWeeklyDigestSettings } from '@/components/clients/affiliate-weekly-digest-settings';
import { SocialWeeklyDigestSettings } from '@/components/clients/social-weekly-digest-settings';
import { ClientNotificationsGrid } from '@/components/clients/client-notifications-grid';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

type ClientPayload = {
  id: string;
  name: string;
  has_affiliate_integration?: boolean;
  affiliate_digest_email_enabled?: boolean;
  affiliate_digest_recipients?: string | null;
  affiliate_digest_timezone?: string;
  affiliate_digest_send_day_of_week?: number;
  affiliate_digest_send_hour?: number;
  affiliate_digest_send_minute?: number;
  affiliate_digest_last_sent_week_key?: string | null;
  social_digest_email_enabled?: boolean;
  social_digest_recipients?: string | null;
  social_digest_timezone?: string;
  social_digest_send_day_of_week?: number;
  social_digest_send_hour?: number;
  social_digest_send_minute?: number;
  social_digest_last_sent_week_key?: string | null;
};

export function ClientNotificationsSubpage({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientPayload | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: ClientPayload };
        if (!cancelled) setClient(d.client);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        icon={Bell}
        title="Notifications"
        subtitle={`Per-channel alert toggles and reporting digests for ${client.name}.`}
      />

      <ClientNotificationsGrid clientId={client.id} />

      <SocialWeeklyDigestSettings
        clientId={client.id}
        socialDigestEnabled={client.social_digest_email_enabled}
        socialDigestRecipients={client.social_digest_recipients}
        socialDigestTimezone={client.social_digest_timezone}
        socialDigestSendDayOfWeek={client.social_digest_send_day_of_week}
        socialDigestSendHour={client.social_digest_send_hour}
        socialDigestSendMinute={client.social_digest_send_minute}
        socialDigestLastSentWeekKey={client.social_digest_last_sent_week_key}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <AffiliateWeeklyDigestSettings
        clientId={client.id}
        upPromoteConnected={!!client.has_affiliate_integration}
        affiliateDigestEnabled={client.affiliate_digest_email_enabled}
        affiliateDigestRecipients={client.affiliate_digest_recipients}
        affiliateDigestTimezone={client.affiliate_digest_timezone}
        affiliateDigestSendDayOfWeek={client.affiliate_digest_send_day_of_week}
        affiliateDigestSendHour={client.affiliate_digest_send_hour}
        affiliateDigestSendMinute={client.affiliate_digest_send_minute}
        affiliateDigestLastSentWeekKey={client.affiliate_digest_last_sent_week_key}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

    </div>
  );
}
