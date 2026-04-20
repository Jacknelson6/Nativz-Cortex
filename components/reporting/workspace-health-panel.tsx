'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, XCircle, Link2Off, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
import type { SocialPlatform } from '@/lib/types/reporting';

interface HealthAccount {
  accountId: string;
  platform: string;
  username: string | null;
  displayName: string | null;
  profileId: string | null;
  status: string;
  canPost: boolean;
  canFetchAnalytics: boolean;
  analyticsSupported: boolean;
  tokenValid: boolean;
  tokenExpiresAt: string | null;
  client: { id: string; name: string; slug: string } | null;
}

interface Health {
  summary: { total: number; healthy: number; warning: number; error: number; needsReconnect: number };
  accounts: HealthAccount[];
}

export function WorkspaceHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch('/api/reporting/workspace-health');
      if (r.ok) setHealth(await r.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  if (loading) return <Skeleton className="h-64" />;
  if (!health) {
    return (
      <Card className="p-5">
        <p className="text-sm text-text-muted">Unable to fetch workspace health from Zernio.</p>
      </Card>
    );
  }

  const rows = showOnlyIssues
    ? health.accounts.filter((a) => a.status !== 'healthy' || !a.tokenValid)
    : health.accounts;

  const pct = (n: number) => (health.summary.total > 0 ? (n / health.summary.total) * 100 : 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border/70 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Connection health</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {health.summary.total} connected · {health.summary.healthy} healthy · {health.summary.warning} warning · {health.summary.needsReconnect} need reconnect
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyIssues}
              onChange={(e) => setShowOnlyIssues(e.target.checked)}
              className="accent-accent-text"
            />
            Issues only
          </label>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex h-1.5 w-full">
        {health.summary.healthy > 0 && <div style={{ width: `${pct(health.summary.healthy)}%` }} className="bg-emerald-500" />}
        {health.summary.warning > 0 && <div style={{ width: `${pct(health.summary.warning)}%` }} className="bg-amber-500" />}
        {health.summary.error > 0 && <div style={{ width: `${pct(health.summary.error)}%` }} className="bg-red-500" />}
        {health.summary.needsReconnect > 0 && <div style={{ width: `${pct(health.summary.needsReconnect)}%` }} className="bg-orange-500" />}
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-text-muted">
          {showOnlyIssues ? 'No issues — all accounts are healthy.' : 'No accounts connected.'}
        </p>
      ) : (
        <div className="divide-y divide-nativz-border/50">
          {rows.map((a) => (
            <div key={a.accountId} className="flex items-center gap-3 px-5 py-3">
              <StatusIcon status={a.status} tokenValid={a.tokenValid} />
              <PlatformBadge platform={a.platform as SocialPlatform} showLabel={false} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary font-medium">
                  {a.client?.name ?? '—'} <span className="text-text-muted font-normal">· {a.platform} {a.username ? `@${a.username}` : ''}</span>
                </p>
                <p className="text-[11px] text-text-muted">
                  {a.canPost ? 'Can post' : 'Cannot post'} · {a.canFetchAnalytics ? 'Analytics OK' : a.analyticsSupported ? 'Analytics blocked' : 'No analytics on this plan'}
                  {a.tokenExpiresAt && ` · token expires ${new Date(a.tokenExpiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className="text-xs text-text-muted uppercase tracking-wide">{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatusIcon({ status, tokenValid }: { status: string; tokenValid: boolean }) {
  if (!tokenValid) return <Link2Off size={14} className="text-orange-500" />;
  if (status === 'healthy') return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (status === 'error') return <XCircle size={14} className="text-red-500" />;
  return <AlertCircle size={14} className="text-amber-500" />;
}
