'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Loader2, Pencil, X, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageUpload } from '@/components/ui/image-upload';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

type GeneralPayload = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website_url: string | null;
  agency: string | null;
  logo_url: string | null;
};

export function GeneralSettingsForm({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<GeneralPayload | null>(null);

  const [industry, setIndustry] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [agency, setAgency] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingLogo, setEditingLogo] = useState(false);
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
        const d = (await res.json()) as { client: GeneralPayload };
        if (cancelled) return;
        const c = d.client;
        setClient(c);
        setIndustry(c.industry ?? '');
        setWebsiteUrl(c.website_url ?? '');
        setAgency(c.agency ?? '');
        setLogoUrl(c.logo_url);
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
          industry,
          website_url: websiteUrl.trim() || null,
          agency: agency.trim() || null,
          logo_url: logoUrl,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      toast.success('General settings saved');
      setClient({ ...client, industry, website_url: websiteUrl.trim() || null, agency: agency.trim() || null, logo_url: logoUrl });
      setEditing(false);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6 text-sm text-red-400">{error}</div>
    );
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6">
        <Loader2 size={20} className="animate-spin text-accent-text" />
      </div>
    );
  }

  const abbreviation = client.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <form onSubmit={handleSave} noValidate className="space-y-6">
      <SettingsPageHeader
        icon={Building2}
        title="General"
        subtitle="Core identity, website, and agency assignment for this client."
        action={
          editing ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => {
                setIndustry(client.industry ?? '');
                setWebsiteUrl(client.website_url ?? '');
                setAgency(client.agency ?? '');
                setLogoUrl(client.logo_url);
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
          )
        }
      />

      <Card>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setEditingLogo(!editingLogo)}
            disabled={!editing}
            className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-hover/50 border border-nativz-border-light transition-all enabled:hover:border-accent/40 enabled:cursor-pointer disabled:opacity-80 disabled:cursor-default"
          >
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt={client.name} className="h-full w-full object-contain p-2" />
            ) : (
              <div className="text-lg font-bold text-accent-text">
                {abbreviation || <Building2 size={24} />}
              </div>
            )}
            {editing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                <Pencil size={14} className="text-white" />
              </div>
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="ui-page-title-md truncate">{client.name}</p>
            <p className="text-sm text-text-muted">Slug: <span className="font-mono">{client.slug}</span></p>
          </div>
        </div>

        {editing && editingLogo && (
          <div className="mt-4">
            <ImageUpload value={logoUrl} onChange={setLogoUrl} size="lg" />
          </div>
        )}
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {editing ? (
            <>
              <Input
                id="website_url"
                label="Website"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
              <Input
                id="industry"
                label="Industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
              <div className="space-y-1.5">
                <label htmlFor="agency" className="block text-sm font-medium text-text-secondary">
                  Agency
                </label>
                <select
                  id="agency"
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                  }}
                >
                  <option value="">Select agency…</option>
                  <option value="Nativz">Nativz</option>
                  <option value="Anderson Collaborative">Anderson Collaborative</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <ReadRow label="Website" value={client.website_url ?? ''} isLink />
              <ReadRow label="Industry" value={client.industry ?? ''} />
              <ReadRow label="Agency" value={client.agency ?? ''} />
            </>
          )}
        </div>
      </Card>
    </form>
  );
}

function ReadRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-muted mb-1">{label}</p>
      {value ? (
        isLink ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent-text hover:underline break-all"
          >
            {value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </a>
        ) : (
          <p className="text-sm text-text-primary">{value}</p>
        )
      ) : (
        <p className="text-sm text-text-muted italic">Not set</p>
      )}
    </div>
  );
}
