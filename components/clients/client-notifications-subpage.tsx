'use client';

import { useEffect, useState } from 'react';
import { Loader2, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AffiliateWeeklyDigestSettings } from '@/components/clients/affiliate-weekly-digest-settings';

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
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bell size={18} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Notifications</h2>
        </div>
        <p className="text-sm text-text-muted">
          Email digests and reporting for {client.name}. Additional channels can be added here later.
        </p>
      </div>

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

      <Card className="border-dashed border-nativz-border bg-white/[0.02] p-5">
        <p className="text-sm font-medium text-text-primary">More notifications</p>
        <p className="text-xs text-text-muted mt-1">
          Slack, additional report schedules, and other alerts will plug in here when you enable them.
        </p>
      </Card>
    </div>
  );
}
