'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ROW_CLASS =
  'flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3';

type AffiliateWeeklyDigestSettingsProps = {
  clientId: string;
  upPromoteConnected: boolean;
  affiliateDigestEnabled?: boolean;
  affiliateDigestRecipients?: string | null;
  onSaved?: () => void;
  /** When false, omit outer Card wrapper (e.g. nested inside another card). */
  withCard?: boolean;
};

/**
 * Weekly UpPromote digest email: recipients + opt-in. PATCHes `affiliate_digest_*` on the client.
 */
export function AffiliateWeeklyDigestSettings({
  clientId,
  upPromoteConnected,
  affiliateDigestEnabled = false,
  affiliateDigestRecipients = '',
  onSaved,
  withCard = true,
}: AffiliateWeeklyDigestSettingsProps) {
  const [digestEnabled, setDigestEnabled] = useState(affiliateDigestEnabled);
  const [digestRecipients, setDigestRecipients] = useState(affiliateDigestRecipients ?? '');
  const [savingDigest, setSavingDigest] = useState(false);

  useEffect(() => {
    setDigestEnabled(affiliateDigestEnabled);
    setDigestRecipients(affiliateDigestRecipients ?? '');
  }, [affiliateDigestEnabled, affiliateDigestRecipients]);

  async function handleSaveDigest() {
    setSavingDigest(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliate_digest_email_enabled: digestEnabled,
          affiliate_digest_recipients: digestRecipients.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to save');
        return;
      }
      toast.success('Affiliate email settings saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingDigest(false);
    }
  }

  const inner = (
    <>
      {!upPromoteConnected ? (
        <p className="text-sm text-text-muted">
          Connect UpPromote in client settings to enable the weekly affiliate digest email.
        </p>
      ) : (
        <div className={`${ROW_CLASS} flex-col items-stretch gap-3`}>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Mail size={16} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Weekly affiliate email</p>
              <p className="text-xs text-text-muted">
                Wednesday (UTC). Past seven days of UpPromote metrics. Sync runs automatically before send.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(e) => setDigestEnabled(e.target.checked)}
              className="rounded border-nativz-border bg-surface-hover"
            />
            <span className="text-sm text-text-primary">Send weekly digest</span>
          </label>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted">Recipients (comma-separated)</label>
            <input
              type="text"
              value={digestRecipients}
              onChange={(e) => setDigestRecipients(e.target.value)}
              placeholder="name@company.com"
              disabled={!digestEnabled}
              className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleSaveDigest} disabled={savingDigest}>
              {savingDigest ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingDigest ? 'Saving…' : 'Save email settings'}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (!withCard) {
    return <div className="space-y-3">{inner}</div>;
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-1">Affiliate notifications</h2>
      <p className="text-sm text-text-muted mb-4">
        Email digest for affiliate program performance.
      </p>
      {inner}
    </Card>
  );
}
