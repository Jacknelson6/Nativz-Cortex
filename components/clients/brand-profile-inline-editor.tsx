'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { Building, Globe, Sparkles, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up — inline edit mode for /admin/brand-profile.
// Everything on this view is edit-in-place: header fields auto-save
// on blur; essence trio auto-saves on blur too. A single "Generate
// with AI" button drafts the essence trio from existing brand data.
//
// Portal still uses the read-only BrandProfileView — this editor is
// strictly an admin surface. Rendering matches BrandProfileView's
// SectionCard style so visually nothing shifts when toggling between
// read and edit modes.
//
// Why a dedicated editor instead of BrandProfileView with `editable`
// flags threaded through? The edit affordances are fundamentally
// different components (inputs vs display text), and mixing both in
// one tree makes it hard to reason about hydration + focus flow.
// Cleaner to have read (BrandProfileView) and edit (this) as siblings.

interface BrandProfileData {
  id: string;
  name: string | null;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  industry: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  tagline: string | null;
  value_proposition: string | null;
  mission_statement: string | null;
}

interface Props {
  profile: BrandProfileData;
  /** Called after any field saves so the parent can re-sync state if needed. */
  onSaved?: () => void;
}

export function BrandProfileInlineEditor({ profile: initialProfile, onSaved }: Props) {
  const [profile, setProfile] = useState<BrandProfileData>(initialProfile);
  const [generating, setGenerating] = useState(false);
  const [, startTransition] = useTransition();

  // Re-sync if the parent hands us a fresh profile (e.g. after the
  // page re-renders on route change).
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  async function patch(fields: Partial<BrandProfileData>) {
    const prev = profile;
    setProfile({ ...profile, ...fields });
    startTransition(async () => {
      const res = await fetch(`/api/clients/${profile.id}/brand-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to save');
        setProfile(prev);
        return;
      }
      toast.success('Saved', { duration: 1200 });
      onSaved?.();
    });
  }

  async function generateEssence() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${profile.id}/brand-essence/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: ['tagline', 'value_proposition', 'mission_statement'] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to generate');
        return;
      }
      const s = data.suggestions ?? {};
      const next: Partial<BrandProfileData> = {};
      if (s.tagline) next.tagline = s.tagline;
      if (s.value_proposition) next.value_proposition = s.value_proposition;
      if (s.mission_statement) next.mission_statement = s.mission_statement;
      if (Object.keys(next).length === 0) {
        toast.info('AI returned no suggestions — add more brand data first.');
        return;
      }
      await patch(next);
      toast.success('Generated brand essence');
    } catch {
      toast.error('Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <HeaderEditor profile={profile} onCommit={patch} />
      <EssenceEditor
        profile={profile}
        onCommit={patch}
        onGenerate={generateEssence}
        generating={generating}
      />
    </div>
  );
}

// ─── Header editor — logo + name + website + description + facts row ──

function HeaderEditor({
  profile, onCommit,
}: {
  profile: BrandProfileData;
  onCommit: (fields: Partial<BrandProfileData>) => Promise<void>;
}) {
  return (
    <header className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="flex items-start gap-4">
        {profile.logo_url ? (
          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-background shrink-0">
            <Image
              src={profile.logo_url}
              alt={`${profile.name ?? 'Brand'} logo`}
              fill
              className="object-contain"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-lg bg-background/50 flex items-center justify-center shrink-0">
            <Building size={24} className="text-text-muted" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Name shown as a static heading — renaming a client has
              ripple effects (vault, Monday, emails); that still lives
              on the main settings form. */}
          <h1 className="text-2xl font-semibold text-text-primary truncate">
            {profile.name ?? 'Brand profile'}
          </h1>

          <InlineField
            icon={<Globe size={12} />}
            label="Website"
            value={profile.website_url}
            placeholder="https://yourbrand.com"
            onCommit={(v) => onCommit({ website_url: v })}
          />

          <InlineTextarea
            label="Description"
            value={profile.description}
            placeholder="A one-paragraph intro to the brand…"
            rows={3}
            onCommit={(v) => onCommit({ description: v })}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-nativz-border">
        <InlineField
          label="Industry"
          value={profile.industry}
          placeholder="e.g. Specialty Coffee"
          onCommit={(v) => onCommit({ industry: v })}
        />
        <InlineField
          label="Brand voice"
          value={profile.brand_voice}
          placeholder="e.g. Warm, confident, witty"
          onCommit={(v) => onCommit({ brand_voice: v })}
        />
        <InlineField
          label="Target audience"
          value={profile.target_audience}
          placeholder="Who it's for"
          onCommit={(v) => onCommit({ target_audience: v })}
        />
      </div>
    </header>
  );
}

// ─── Essence editor — tagline / value prop / mission ──────────────────

function EssenceEditor({
  profile, onCommit, onGenerate, generating,
}: {
  profile: BrandProfileData;
  onCommit: (fields: Partial<BrandProfileData>) => Promise<void>;
  onGenerate: () => Promise<void>;
  generating: boolean;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">Brand essence</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Tagline, value prop, and mission — the brand&apos;s story in three beats.
            </p>
          </div>
        </div>
        <button
          onClick={() => void onGenerate()}
          disabled={generating}
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent-text/30 bg-accent-text/5 px-3 py-1.5 text-xs text-accent-text hover:bg-accent-text/10 disabled:opacity-50"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? 'Generating…' : 'Generate with AI'}
        </button>
      </header>

      <div className="mt-5 space-y-4">
        <InlineTextarea
          label="Tagline"
          value={profile.tagline}
          placeholder="Funded by real estate investors."
          rows={1}
          onCommit={(v) => onCommit({ tagline: v })}
        />
        <InlineTextarea
          label="Value proposition"
          value={profile.value_proposition}
          placeholder="What specific outcome you deliver for your audience."
          rows={2}
          onCommit={(v) => onCommit({ value_proposition: v })}
        />
        <InlineTextarea
          label="Mission statement"
          value={profile.mission_statement}
          placeholder="Why the brand exists — long-term intent, not tactics."
          rows={3}
          onCommit={(v) => onCommit({ mission_statement: v })}
        />
      </div>
    </section>
  );
}

// ─── Inline input primitives ──────────────────────────────────────────

function Label({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold inline-flex items-center gap-1">
      {icon}
      {children}
    </label>
  );
}

function InlineField({
  label, icon, value, placeholder, onCommit,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string | null;
  placeholder: string;
  onCommit: (v: string | null) => void | Promise<void>;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const dirty = useMemo(() => v !== (value ?? ''), [v, value]);

  function commit() {
    if (!dirty) return;
    const trimmed = v.trim();
    void onCommit(trimmed.length === 0 ? null : trimmed);
  }

  return (
    <div>
      <Label icon={icon}>{label}</Label>
      <input
        type="text"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-text-primary placeholder:text-text-muted/60 hover:border-nativz-border focus:border-accent/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
      />
    </div>
  );
}

function InlineTextarea({
  label, value, placeholder, rows, onCommit,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  rows: number;
  onCommit: (v: string | null) => void | Promise<void>;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const dirty = useMemo(() => v !== (value ?? ''), [v, value]);

  function commit() {
    if (!dirty) return;
    const trimmed = v.trim();
    void onCommit(trimmed.length === 0 ? null : trimmed);
  }

  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-text-primary placeholder:text-text-muted/60 hover:border-nativz-border focus:border-accent/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors resize-y leading-relaxed"
      />
      {dirty && (
        <span className="text-[10px] text-text-muted mt-1 inline-flex items-center gap-1">
          <Check size={10} /> Saves when you click away
        </span>
      )}
    </div>
  );
}
