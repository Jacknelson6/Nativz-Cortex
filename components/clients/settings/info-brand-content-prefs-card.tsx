'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Wand2, Plus, X } from 'lucide-react';
import { InfoCard } from './info-card';

/**
 * InfoBrandContentPrefsCard — writing style + AI image style + banned phrases
 * + content language. Read-first with one Cancel/Save pair covering all four
 * fields. Banned phrases is a draft-mode tag list — adds/removes are local
 * until Save commits, and Cancel reverts the lot.
 */

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

type ContentPrefs = {
  writing_style: string | null;
  ai_image_style: string | null;
  banned_phrases: string[];
  content_language: string | null;
};

export function InfoBrandContentPrefsCard({
  clientId,
  initial,
  voiceLabel,
}: {
  clientId: string;
  initial: ContentPrefs;
  /** The brand_voice value, surfaced read-only as a hint of where tone lives. */
  voiceLabel: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<ContentPrefs>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [writing, setWriting] = useState(initial.writing_style ?? '');
  const [imageStyle, setImageStyle] = useState(initial.ai_image_style ?? '');
  const [banned, setBanned] = useState<string[]>(initial.banned_phrases);
  const [language, setLanguage] = useState(initial.content_language ?? 'en');

  const dirty =
    (writing.trim() || null) !== (saved.writing_style ?? null) ||
    (imageStyle.trim() || null) !== (saved.ai_image_style ?? null) ||
    JSON.stringify(banned) !== JSON.stringify(saved.banned_phrases) ||
    language !== (saved.content_language ?? 'en');

  function reset() {
    setWriting(saved.writing_style ?? '');
    setImageStyle(saved.ai_image_style ?? '');
    setBanned(saved.banned_phrases);
    setLanguage(saved.content_language ?? 'en');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        writing_style: writing.trim() || null,
        ai_image_style: imageStyle.trim() || null,
        banned_phrases: banned,
        content_language: language || null,
      };
      const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      setSaved(body);
      setEditing(false);
      toast.success('Content preferences saved');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <InfoCard
      icon={<Wand2 size={16} />}
      title="Content preferences"
      description="How AI writes and generates images for this brand. The more specific, the more on-brand."
      state={editing ? 'edit' : 'read'}
      edit={{ onClick: () => setEditing(true) }}
      cancel={{
        onClick: () => { reset(); setEditing(false); },
        disabled: saving,
      }}
      save={{ onClick: handleSave, loading: saving, dirty }}
    >
      {editing ? (
        <div className="space-y-5">
          <EditTextArea
            label="Writing style"
            value={writing}
            onChange={setWriting}
            rows={3}
            placeholder="e.g. Short sentences. No jargon. Second-person (you/your). Warm, confident, never hype-y."
          />
          <EditTextArea
            label="AI image style"
            value={imageStyle}
            onChange={setImageStyle}
            rows={3}
            placeholder="e.g. Natural lighting, earth tones, no stock-photo people, product-first compositions."
          />
          <DraftTagList
            label="Banned phrases"
            values={banned}
            onChange={setBanned}
            placeholder="e.g. game-changer"
          />
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Content language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors cursor-pointer appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                paddingRight: '2rem',
              }}
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ReadField label="Tone of voice" value={voiceLabel} emptyLabel="Set on the Brand voice card above" />
          <ReadField label="Writing style" value={saved.writing_style} emptyLabel="No writing style set" />
          <ReadField label="AI image style" value={saved.ai_image_style} emptyLabel="No image style set" />
          <ReadTags label="Banned phrases" values={saved.banned_phrases} />
          <ReadField
            label="Content language"
            value={LANGUAGE_OPTIONS.find((o) => o.value === (saved.content_language ?? 'en'))?.label ?? saved.content_language}
            emptyLabel="English"
          />
        </div>
      )}
    </InfoCard>
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

function DraftTagList({
  label, values, onChange, placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  function addTag() {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
  }
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <div className="mt-2 flex flex-wrap gap-1.5 min-h-[28px]">
        {values.length === 0 && (
          <span className="text-xs italic text-text-muted">None yet</span>
        )}
        {values.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-background px-2.5 py-0.5 text-xs text-text-secondary"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== t))}
              className="text-text-muted hover:text-red-400 transition-colors"
              aria-label={`Remove ${t}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface-hover px-2.5 py-1 text-xs text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Plus size={10} /> Add
        </button>
      </div>
    </div>
  );
}

function ReadField({
  label, value, emptyLabel,
}: {
  label: string;
  value: string | null | undefined;
  emptyLabel: string;
}) {
  const has = !!(value && value.trim().length > 0);
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <p className={`mt-1.5 text-sm leading-relaxed ${has ? 'text-text-primary' : 'italic text-text-muted'}`}>
        {has ? value : emptyLabel}
      </p>
    </div>
  );
}

function ReadTags({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      {values.length === 0 ? (
        <p className="mt-1.5 text-sm italic text-text-muted">None — content can use any phrases</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-nativz-border bg-background px-2.5 py-0.5 text-xs text-text-secondary"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
