'use client';

import { useState, useEffect } from 'react';
import { Bell, Save, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface RevisionWebhookSettingsProps {
  clientId: string;
}

export function RevisionWebhookSettings({ clientId }: RevisionWebhookSettingsProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}/webhook-settings`);
        if (res.ok) {
          const data = await res.json();
          setWebhookUrl(data.revision_webhook_url ?? '');
          setOriginalUrl(data.revision_webhook_url ?? '');
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, [clientId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/webhook-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_webhook_url: webhookUrl.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to save');
        return;
      }
      setOriginalUrl(webhookUrl.trim());
      toast.success('Webhook settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = webhookUrl.trim() !== originalUrl;

  if (loading) return null;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={16} className="text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Revision notifications</h3>
      </div>
      <p className="text-xs text-text-muted mb-4">
        When clients leave revision comments on shared calendar posts, send a notification to this webhook URL.
        Works with Google Chat, Slack, and any service that accepts POST requests with a JSON body.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">
            Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-[10px] text-text-muted mt-1">
            For Google Chat: create a webhook in your space settings and paste the URL here.
          </p>
        </div>

        {hasChanges && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
