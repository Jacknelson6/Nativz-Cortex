'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Loader2, Pencil, X, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ResourcesPayload = {
  id: string;
  google_drive_branding_url: string | null;
  google_drive_calendars_url: string | null;
};

export function ResourcesSettingsForm({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ResourcesPayload | null>(null);
  const [brandingUrl, setBrandingUrl] = useState('');
  const [calendarsUrl, setCalendarsUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: ResourcesPayload };
        if (cancelled) return;
        setClient(d.client);
        setBrandingUrl(d.client.google_drive_branding_url ?? '');
        setCalendarsUrl(d.client.google_drive_calendars_url ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_drive_branding_url: brandingUrl.trim() || null,
          google_drive_calendars_url: calendarsUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      toast.success('Resources saved');
      setClient({
        ...client,
        google_drive_branding_url: brandingUrl.trim() || null,
        google_drive_calendars_url: calendarsUrl.trim() || null,
      });
      setEditing(false);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <div className="flex min-h-[20vh] items-center justify-center p-6 text-sm text-red-400">{error}</div>;
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6">
        <Loader2 size={20} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} noValidate className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Resources</h2>
          <p className="text-sm text-text-muted mt-0.5">
            External links to shared branding and content calendar folders.
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              setBrandingUrl(client.google_drive_branding_url ?? '');
              setCalendarsUrl(client.google_drive_calendars_url ?? '');
              setEditing(false);
            }}>
              <X size={14} />
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Edit
          </Button>
        )}
      </div>

      <Card>
        {editing ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="google_drive_branding_url"
              label="Google Drive — branding assets"
              type="url"
              value={brandingUrl}
              onChange={(e) => setBrandingUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
            />
            <Input
              id="google_drive_calendars_url"
              label="Google Drive — content calendars"
              type="url"
              value={calendarsUrl}
              onChange={(e) => setCalendarsUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ResourceLink label="Branding assets" href={client.google_drive_branding_url} />
            <ResourceLink label="Content calendars" href={client.google_drive_calendars_url} />
          </div>
        )}
      </Card>
    </form>
  );
}

function ResourceLink({ label, href }: { label: string; href: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-muted mb-1">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline break-all"
        >
          <ExternalLink size={12} />
          Open in Drive
        </a>
      ) : (
        <p className="text-sm text-text-muted italic">Not set</p>
      )}
    </div>
  );
}
