'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Handshake, Check, X, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UpPromoteLogo } from '@/components/integrations/uppromote-logo';

export function UpPromoteIntegrationCard({
  clientId,
  hasApiKey,
}: {
  clientId: string;
  hasApiKey: boolean;
}) {
  const [connected, setConnected] = useState(hasApiKey);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleConnect() {
    if (!apiKey.trim()) {
      toast.error('Enter an API key');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/uppromote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to connect');
        return;
      }
      setConnected(true);
      setApiKey('');
      toast.success('UpPromote connected — initial sync started');
    } catch {
      toast.error('Failed to connect');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/uppromote`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to disconnect');
        return;
      }
      setConnected(false);
      toast.success('UpPromote disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <UpPromoteLogo size={40} className="h-10 w-10 ring-1 ring-white/10" />
        <div>
          <h2 className="text-base font-semibold text-text-primary">UpPromote</h2>
          <p className="text-xs text-text-muted">Affiliate integration</p>
        </div>
      </div>

      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
            <Check size={14} className="text-emerald-400" />
            <p className="text-sm text-emerald-400 font-medium">UpPromote connected</p>
          </div>
          <p className="text-xs text-text-muted">
            Affiliate data syncs automatically every hour. You can view data under Analytics → Affiliates.
          </p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleDisconnect}
            disabled={removing}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Connect UpPromote to sync affiliate data. Find your API key in UpPromote → Settings → Integrations.
          </p>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pk_..."
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
          <Button size="sm" type="button" onClick={handleConnect} disabled={saving || !apiKey.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Handshake size={14} />}
            {saving ? 'Connecting...' : 'Connect UpPromote'}
          </Button>
        </div>
      )}
    </Card>
  );
}
