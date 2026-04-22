'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Sparkles, Loader2, Check, Globe, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up: admin edit surface for the expanded brand-profile
// fields — essence trio, products/aliases, content generation prefs,
// default location. Lives above BrandDNAView on the admin brand
// settings page. One big component so the admin can edit every new
// field from one place; individual panels save independently on blur
// (essence) or on tag add/remove (arrays) to keep the mental model
// simple.

interface BrandProfile {
  tagline: string | null;
  value_proposition: string | null;
  mission_statement: string | null;
  products: string[];
  brand_aliases: string[];
  writing_style: string | null;
  ai_image_style: string | null;
  banned_phrases: string[];
  content_language: string | null;
  primary_country: string | null;
  primary_state: string | null;
  primary_city: string | null;
  // Also surface the always-editable ones so admin sees them in context
  // even though they're owned by BrandSettingsForm above:
  industry: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  services: string[];
  topic_keywords: string[];
}

const DEFAULT_PROFILE: BrandProfile = {
  tagline: null,
  value_proposition: null,
  mission_statement: null,
  products: [],
  brand_aliases: [],
  writing_style: null,
  ai_image_style: null,
  banned_phrases: [],
  content_language: 'en',
  primary_country: null,
  primary_state: null,
  primary_city: null,
  industry: null,
  brand_voice: null,
  target_audience: null,
  services: [],
  topic_keywords: [],
};

// Common content-generation languages. Admin can still free-type via
// the "Other" path if the language they need isn't listed.
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
];

export function BrandEssenceSection({ clientId }: { clientId: string }) {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => { void fetchProfile(); }, [clientId]);

  async function fetchProfile() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-profile`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setProfile({ ...DEFAULT_PROFILE, ...data.profile });
    } catch (err) {
      console.error('BrandEssenceSection: fetch failed', err);
      toast.error('Failed to load brand profile');
    } finally {
      setLoading(false);
    }
  }

  /** Patch one or many fields on the server + optimistically update. */
  async function patch(fields: Partial<BrandProfile>) {
    if (!profile) return;
    // Optimistic: update UI immediately; snap back on failure.
    const prev = profile;
    setProfile({ ...profile, ...fields });
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
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
      toast.success('Saved');
    });
  }

  async function generateEssence() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-essence/generate`, {
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
      const next: Partial<BrandProfile> = {};
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

  if (loading || !profile) {
    return (
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Brand essence</h3>
        <p className="text-sm text-text-muted">Loading…</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <EssenceTrioCard profile={profile} patch={patch} generate={generateEssence} generating={generating} />
      <ProductsCard profile={profile} patch={patch} />
      <AliasesCard profile={profile} patch={patch} />
      <ContentGenerationCard profile={profile} patch={patch} />
      <DefaultLocationCard profile={profile} patch={patch} />
    </div>
  );
}

// ─── Subsections ───────────────────────────────────────────────────────

function EssenceTrioCard({
  profile, patch, generate, generating,
}: {
  profile: BrandProfile;
  patch: (fields: Partial<BrandProfile>) => Promise<void>;
  generate: () => Promise<void>;
  generating: boolean;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Brand essence</h3>
          <p className="text-xs text-text-muted mt-1">
            Tagline, value prop, and mission. Use <strong>Generate with AI</strong>
            {' '}to draft all three from existing brand data — you can edit after.
          </p>
        </div>
        <button
          onClick={() => void generate()}
          disabled={generating}
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent-text/30 bg-accent-text/5 px-3 py-1.5 text-xs text-accent-text hover:bg-accent-text/10 disabled:opacity-50"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? 'Generating…' : 'Generate with AI'}
        </button>
      </div>

      <TextFieldOnBlur
        label="Tagline"
        placeholder="Funded by real estate investors."
        value={profile.tagline}
        onCommit={(v) => patch({ tagline: v })}
      />
      <TextareaFieldOnBlur
        label="Value proposition"
        placeholder="What specific outcome you deliver for your audience."
        rows={2}
        value={profile.value_proposition}
        onCommit={(v) => patch({ value_proposition: v })}
      />
      <TextareaFieldOnBlur
        label="Mission statement"
        placeholder="Why the brand exists — long-term intent, not tactics."
        rows={3}
        value={profile.mission_statement}
        onCommit={(v) => patch({ mission_statement: v })}
      />
    </section>
  );
}

function ProductsCard({
  profile, patch,
}: {
  profile: BrandProfile;
  patch: (fields: Partial<BrandProfile>) => Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Products</h3>
        <p className="text-xs text-text-muted mt-1">
          Named offerings so AI content can reference the right one in
          context. Services are managed above; add discrete products here.
        </p>
      </div>
      <TagListField
        label="Products"
        values={profile.products}
        onCommit={(next) => patch({ products: next })}
        placeholder="e.g. Fix-and-flip loan"
      />
    </section>
  );
}

function AliasesCard({
  profile, patch,
}: {
  profile: BrandProfile;
  patch: (fields: Partial<BrandProfile>) => Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Brand aliases</h3>
        <p className="text-xs text-text-muted mt-1">
          Alternate names the brand goes by — helps AI spot mentions across
          platforms.
        </p>
      </div>
      <TagListField
        label="Aliases"
        values={profile.brand_aliases}
        onCommit={(next) => patch({ brand_aliases: next })}
        placeholder="e.g. Nivasa, Nivasa Brand"
      />
    </section>
  );
}

function ContentGenerationCard({
  profile, patch,
}: {
  profile: BrandProfile;
  patch: (fields: Partial<BrandProfile>) => Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Content generation preferences</h3>
        <p className="text-xs text-text-muted mt-1">
          How AI writes + images for this brand. The more specific,
          the more on-brand the output.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Tone of voice</Label>
          <p className="text-sm text-text-muted mt-1">
            {profile.brand_voice ?? <em>Set via Brand Information above.</em>}
          </p>
        </div>
        <div>
          <Label>Content language</Label>
          <select
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            value={profile.content_language ?? 'en'}
            onChange={(e) => void patch({ content_language: e.target.value })}
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <TextareaFieldOnBlur
        label="Writing style"
        placeholder="e.g. Short sentences. No jargon. Second-person (you/your). Warm, confident, never hype-y."
        rows={3}
        value={profile.writing_style}
        onCommit={(v) => patch({ writing_style: v })}
      />
      <TextareaFieldOnBlur
        label="AI image style"
        placeholder="e.g. Natural lighting, earth tones, no stock-photo people, product-first compositions."
        rows={3}
        value={profile.ai_image_style}
        onCommit={(v) => patch({ ai_image_style: v })}
      />
      <TagListField
        label="Banned phrases"
        values={profile.banned_phrases}
        onCommit={(next) => patch({ banned_phrases: next })}
        placeholder="e.g. game-changer"
      />
    </section>
  );
}

function DefaultLocationCard({
  profile, patch,
}: {
  profile: BrandProfile;
  patch: (fields: Partial<BrandProfile>) => Promise<void>;
}) {
  const [country, setCountry] = useState(profile.primary_country ?? '');
  const [state, setState] = useState(profile.primary_state ?? '');
  const [city, setCity] = useState(profile.primary_city ?? '');
  useEffect(() => { setCountry(profile.primary_country ?? ''); }, [profile.primary_country]);
  useEffect(() => { setState(profile.primary_state ?? ''); }, [profile.primary_state]);
  useEffect(() => { setCity(profile.primary_city ?? ''); }, [profile.primary_city]);

  const dirty =
    country !== (profile.primary_country ?? '') ||
    state !== (profile.primary_state ?? '') ||
    city !== (profile.primary_city ?? '');

  function save() {
    if (!country && (state || city)) {
      toast.error('Country is required when state or city is set.');
      return;
    }
    void patch({
      primary_country: country.trim() || null,
      primary_state: state.trim() || null,
      primary_city: city.trim() || null,
    });
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Globe size={14} className="text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Default location</h3>
      </div>
      <p className="text-xs text-text-muted">
        Used to geo-frame content (language, references, regional
        trends). Go as wide or as granular as you want — country-only is
        fine for national brands; add state / city for local businesses.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Country</Label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="United States"
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <Label>State / region (optional)</Label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="California"
            disabled={!country}
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
          />
        </div>
        <div>
          <Label>City (optional)</Label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Los Angeles"
            disabled={!country}
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={!dirty}
          className="inline-flex items-center gap-1 rounded bg-foreground text-background px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <Check size={12} /> Save location
        </button>
      </div>
    </section>
  );
}

// ─── Primitive input helpers ───────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
      {children}
    </label>
  );
}

function TextFieldOnBlur({
  label, placeholder, value, onCommit,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  onCommit: (v: string | null) => void | Promise<void>;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="text"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value ?? '')) void onCommit(v.trim() || null); }}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}

function TextareaFieldOnBlur({
  label, placeholder, value, onCommit, rows,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  onCommit: (v: string | null) => void | Promise<void>;
  rows: number;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value ?? '')) void onCommit(v.trim() || null); }}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-y"
      />
    </div>
  );
}

function TagListField({
  label, values, onCommit, placeholder, readOnly,
}: {
  label: string;
  values: string[];
  onCommit: (next: string[]) => void | Promise<void>;
  placeholder: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const list = useMemo(() => values ?? [], [values]);
  function addTag() {
    const v = draft.trim();
    if (!v) return;
    if (list.includes(v)) {
      setDraft('');
      return;
    }
    void onCommit([...list, v]);
    setDraft('');
  }
  function removeTag(t: string) {
    void onCommit(list.filter((x) => x !== t));
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {list.length === 0 && (
          <span className="text-xs text-text-muted italic">
            {readOnly ? placeholder : 'None yet'}
          </span>
        )}
        {list.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-background px-2 py-0.5 text-xs text-text-secondary"
          >
            {t}
            {!readOnly && (
              <button
                onClick={() => removeTag(t)}
                className="text-text-muted hover:text-red-400"
                aria-label={`Remove ${t}`}
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder={placeholder}
            className="flex-1 rounded border border-nativz-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={addTag}
            className="rounded bg-foreground text-background px-2 py-1 text-xs inline-flex items-center gap-1"
          >
            <Plus size={10} /> Add
          </button>
        </div>
      )}
    </div>
  );
}
