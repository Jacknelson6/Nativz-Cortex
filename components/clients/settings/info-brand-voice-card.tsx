'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Megaphone } from 'lucide-react';
import { InfoCard, InfoField } from './info-card';

/**
 * InfoBrandVoiceCard — voice / target audience / topic keywords / description.
 * Read-first with Cancel/Save and a footer "Generate from website" action that
 * hits /api/clients/analyze-url and backfills the draft inputs.
 *
 * Replaces the identity-field block inside BrandSettingsForm on the info page.
 * The commercial/drive-link block of BrandSettingsForm renders below this card
 * via `hideIdentityFields` so edit surfaces don't duplicate.
 */

type VoicePayload = {
  id: string;
  website_url: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  topic_keywords: string[] | null;
  description: string | null;
};

export function InfoBrandVoiceCard({
  slug,
  initial,
}: {
  slug: string;
  /** SSR-fetched voice values; when supplied, the card hydrates without an
   *  initial fetch round-trip. */
  initial?: VoicePayload;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<VoicePayload | null>(initial ?? null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [voice, setVoice] = useState(initial?.brand_voice ?? '');
  const [audience, setAudience] = useState(initial?.target_audience ?? '');
  const [keywords, setKeywords] = useState((initial?.topic_keywords ?? []).join(', '));
  const [description, setDescription] = useState(initial?.description ?? '');

  useEffect(() => {
    if (initial) return;
    const cancelled = { current: false };
    void load(cancelled);
    return () => { cancelled.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, initial]);

  // `cancelled` is passed as a ref-shaped object so the effect's cleanup can
  // flip it after `load()` has already started — passing a boolean by value
  // would freeze the flag at call-time and the late response would still
  // overwrite state if the user switched clients mid-fetch.
  async function load(cancelled?: { current: boolean }) {
    setError(null);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || 'Failed to load client');
      }
      const d = (await res.json()) as { client: VoicePayload };
      if (cancelled?.current) return;
      setSaved(d.client);
      setVoice(d.client.brand_voice ?? '');
      setAudience(d.client.target_audience ?? '');
      setKeywords((d.client.topic_keywords ?? []).join(', '));
      setDescription(d.client.description ?? '');
    } catch (e) {
      if (cancelled?.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  const currentKeywordsStr = (saved?.topic_keywords ?? []).join(', ');
  const dirty = !!saved && (
    (voice.trim() || null) !== (saved.brand_voice ?? null) ||
    (audience.trim() || null) !== (saved.target_audience ?? null) ||
    keywords.trim() !== currentKeywordsStr ||
    (description.trim() || null) !== (saved.description ?? null)
  );

  async function handleSave() {
    if (!saved) return;
    setSaving(true);
    try {
      const nextKeywords = keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const body = {
        brand_voice: voice.trim() || null,
        target_audience: audience.trim() || null,
        topic_keywords: nextKeywords,
        description: description.trim() || null,
      };
      const res = await fetch(`/api/clients/${saved.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      const next: VoicePayload = {
        ...saved,
        brand_voice: body.brand_voice,
        target_audience: body.target_audience,
        topic_keywords: nextKeywords,
        description: body.description,
      };
      setSaved(next);
      setEditing(false);
      toast.success('Brand voice saved');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!saved?.website_url) {
      toast.error('Set a website URL in Identity first.');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: saved.website_url }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to analyze website');
        return;
      }
      const data = await res.json();
      let touched = 0;
      if (typeof data.brand_voice === 'string' && data.brand_voice) { setVoice(data.brand_voice); touched++; }
      if (typeof data.target_audience === 'string' && data.target_audience) {
        setAudience(data.target_audience); touched++;
      }
      if (Array.isArray(data.topic_keywords) && data.topic_keywords.length > 0) {
        setKeywords(data.topic_keywords.join(', ')); touched++;
      }
      if (touched === 0) {
        toast.info('AI returned no suggestions — add more brand data first.');
        return;
      }
      toast.success('Drafts generated — review and save');
    } catch {
      toast.error('Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  if (error && !saved) {
    return (
      <InfoCard
        icon={<Megaphone size={16} />}
        title="Brand voice"
        description="Tone, audience, and the keywords every AI flow uses."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </InfoCard>
    );
  }

  if (!saved) {
    return (
      <InfoCard icon={<Megaphone size={16} />} title="Brand voice">
        <div className="space-y-3">
          <div className="h-3 w-24 bg-surface-hover rounded animate-pulse" />
          <div className="h-8 w-full bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-28 bg-surface-hover rounded animate-pulse mt-4" />
          <div className="h-10 w-full bg-surface-hover rounded animate-pulse" />
        </div>
      </InfoCard>
    );
  }

  return (
    <InfoCard
      icon={<Megaphone size={16} />}
      title="Brand voice"
      description="Tone, audience, and the keywords every AI flow uses. Populate once; every downstream flow reads from here."
      state={editing ? 'edit' : 'read'}
      edit={{ onClick: () => setEditing(true) }}
      cancel={{
        onClick: () => {
          setVoice(saved.brand_voice ?? '');
          setAudience(saved.target_audience ?? '');
          setKeywords((saved.topic_keywords ?? []).join(', '));
          setDescription(saved.description ?? '');
          setEditing(false);
        },
        disabled: saving,
      }}
      save={{ onClick: handleSave, loading: saving, dirty }}
      aiGenerate={
        saved.website_url
          ? {
            onClick: handleGenerate,
            loading: generating,
            label: 'Generate from website',
          }
          : undefined
      }
      footerNote={
        saved.website_url
          ? 'AI reads the website and drafts voice, audience, and keywords — edit before saving.'
          : 'Add a website URL in Identity to unlock AI-drafted voice + audience.'
      }
    >
      {editing ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <EditTextArea
              label="Brand voice"
              value={voice}
              onChange={setVoice}
              rows={3}
              placeholder="Tone, register, personality — how they sound in writing."
            />
            <EditTextArea
              label="Target audience"
              value={audience}
              onChange={setAudience}
              rows={3}
              placeholder="Who this brand serves and what they're trying to accomplish."
            />
          </div>
          <EditTextLine
            label="Topic keywords"
            value={keywords}
            onChange={setKeywords}
            placeholder="Comma-separated. e.g. fitness, nutrition, wellness"
          />
          <EditTextArea
            label="Description"
            value={description}
            onChange={setDescription}
            rows={3}
            placeholder="Optional long-form background — history, positioning, anything the AI should know."
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InfoField label="Brand voice" value={saved.brand_voice} emptyLabel="No voice captured yet" />
            <InfoField label="Target audience" value={saved.target_audience} emptyLabel="No audience captured yet" />
          </div>
          <KeywordsField values={saved.topic_keywords ?? []} />
          <InfoField label="Description" value={saved.description} emptyLabel="No description yet" />
        </div>
      )}
    </InfoCard>
  );
}

function EditTextLine({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
      />
    </div>
  );
}

function EditTextArea({
  label, value, onChange, rows, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors resize-y leading-relaxed"
      />
    </div>
  );
}

function KeywordsField({ values }: { values: string[] }) {
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        Topic keywords
      </span>
      {values.length === 0 ? (
        <p className="mt-1.5 text-sm italic text-text-muted">No keywords yet</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((k) => (
            <span
              key={k}
              className="inline-flex items-center rounded-full border border-nativz-border bg-background px-2.5 py-0.5 text-xs text-text-secondary"
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
