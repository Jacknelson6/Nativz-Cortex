'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles, DollarSign, ExternalLink, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  SettingsPageHeader,
  SettingsSectionHeader,
} from '@/components/clients/settings/settings-primitives';

type BrandPayload = {
  id: string;
  name: string;
  website_url: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  description: string | null;
  services: string[] | null;
  monthly_boosting_budget: number | null;
  google_drive_branding_url: string | null;
  google_drive_calendars_url: string | null;
};

export function BrandSettingsForm({ slug, embedded }: { slug: string; embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<BrandPayload | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: BrandPayload };
        if (cancelled) return;
        setClient(d.client);
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

  function patch(fields: Partial<BrandPayload>) {
    if (!client) return;
    const prev = client;
    setClient({ ...client, ...fields });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/clients/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error((d as { error?: string }).error || 'Failed to save');
          setClient(prev);
        }
      } catch {
        toast.error('Something went wrong');
        setClient(prev);
      }
    });
  }

  async function handleGenerateAI() {
    if (!client?.website_url) {
      toast.error('Set a website URL first (in General).');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: client.website_url }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to analyze website');
        return;
      }
      const data = await res.json();
      const next: Partial<BrandPayload> = {};
      if (data.target_audience) next.target_audience = data.target_audience;
      if (data.brand_voice) next.brand_voice = data.brand_voice;
      if (data.topic_keywords) next.topic_keywords = data.topic_keywords;
      if (Object.keys(next).length > 0) {
        patch(next);
        toast.success('Fields generated from website.');
      } else {
        toast.info('AI returned nothing — add more brand data first.');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setAnalyzing(false);
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
    <section className="space-y-5">
      {!embedded && (
        <SettingsPageHeader
          icon={Palette}
          title="Brand profile"
          subtitle="Audience, voice, keywords — the context every AI flow in Cortex uses for this client."
          action={
            client.website_url ? (
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateAI} disabled={analyzing}>
                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {analyzing ? 'Analyzing…' : 'Generate from website'}
              </Button>
            ) : null
          }
        />
      )}

      {embedded && client.website_url && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleGenerateAI} disabled={analyzing}>
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {analyzing ? 'Analyzing…' : 'Generate from website'}
          </Button>
        </div>
      )}

      {!embedded && <SettingsSectionHeader title="Identity" />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Textarea
          id="target_audience"
          label="Target audience"
          defaultValue={client.target_audience ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (client.target_audience ?? '')) patch({ target_audience: v || null });
          }}
          placeholder="Who this brand serves and what they're trying to accomplish."
          rows={3}
        />
        <Textarea
          id="brand_voice"
          label="Brand voice"
          defaultValue={client.brand_voice ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (client.brand_voice ?? '')) patch({ brand_voice: v || null });
          }}
          placeholder="Tone, register, personality — how they sound in writing."
          rows={3}
        />
      </div>

      <Input
        id="topic_keywords"
        label="Topic keywords"
        defaultValue={(client.topic_keywords ?? []).join(', ')}
        onBlur={(e) => {
          const next = e.target.value.split(',').map((k) => k.trim()).filter(Boolean);
          const prev = client.topic_keywords ?? [];
          if (next.join('|') !== prev.join('|')) patch({ topic_keywords: next });
        }}
        placeholder="Comma-separated. e.g. fitness, nutrition, wellness"
      />

      <Textarea
        id="description"
        label="Description"
        defaultValue={client.description ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (client.description ?? '')) patch({ description: v || null });
        }}
        placeholder="Optional long-form background — history, positioning, anything the AI should know."
        rows={3}
      />

      <SettingsSectionHeader title="Commercial" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <span className="block text-sm font-medium text-text-secondary mb-1.5">Services</span>
          {(client.services ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(client.services ?? []).map((svc) => (
                <span
                  key={svc}
                  className="inline-flex items-center rounded-full bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border px-2.5 py-0.5 text-xs font-medium"
                >
                  {svc}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Managed from{' '}
              <span className="text-text-secondary">Access &amp; services</span>.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="boosting_budget"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Boosting budget
          </label>
          <div className="relative">
            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              id="boosting_budget"
              type="text"
              inputMode="numeric"
              defaultValue={client.monthly_boosting_budget != null ? String(client.monthly_boosting_budget) : ''}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const next = raw ? Number(raw) : null;
                if (next !== client.monthly_boosting_budget) patch({ monthly_boosting_budget: next });
              }}
              placeholder="e.g. 500"
              className="block w-full rounded-lg border border-nativz-border bg-surface pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <p className="text-[11px] text-text-muted mt-1">Monthly spend target — drives reporting and recs.</p>
        </div>
      </div>

      <SettingsSectionHeader
        title="Shared drive links"
        description="Quick jumps to the drive folders your team uses during production."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DriveLinkInput
          id="google_drive_branding_url"
          label="Branding assets"
          defaultValue={client.google_drive_branding_url ?? ''}
          current={client.google_drive_branding_url}
          onSave={(v) => patch({ google_drive_branding_url: v })}
        />
        <DriveLinkInput
          id="google_drive_calendars_url"
          label="Content calendars"
          defaultValue={client.google_drive_calendars_url ?? ''}
          current={client.google_drive_calendars_url}
          onSave={(v) => patch({ google_drive_calendars_url: v })}
        />
      </div>
    </section>
  );
}

function DriveLinkInput({
  id,
  label,
  defaultValue,
  current,
  onSave,
}: {
  id: string;
  label: string;
  defaultValue: string;
  current: string | null;
  onSave: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
        {current && (
          <a
            href={current}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline"
          >
            <ExternalLink size={11} />
            Open
          </a>
        )}
      </div>
      <input
        id={id}
        type="url"
        defaultValue={defaultValue}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if ((v || null) !== (current ?? null)) onSave(v || null);
        }}
        placeholder="https://drive.google.com/…"
        className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}
