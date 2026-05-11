'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MessageSquareQuote, Plus, X } from 'lucide-react';
import { InfoCard } from './info-card';
import { cn } from '@/lib/utils/cn';

/**
 * InfoBrandCaptionsCard — replaces the old Content preferences card on the
 * client info page. One surface for everything that shapes how Cortex writes
 * captions for this brand:
 *
 *   1. Caption notes — free-text guidance fed into the model prompt. Voice,
 *      structure, hook style, banned phrases.
 *   2. CTA (verbatim) — short call-to-action appended literally to every
 *      AI-written caption. Also AI-draftable from the website + brand data.
 *   3. Hashtag wall (verbatim) — list of tags appended literally to every
 *      caption. Stored bare (no leading '#'); display re-prefixes. Also
 *      AI-draftable.
 *
 * Read-first, single Cancel/Save pair commits all three at once. The "Draft
 * with AI" pill at the bottom regenerates CTA + hashtags from current brand
 * data — the strategist still gets to review and edit before saving.
 */

type CaptionFields = {
  caption_notes: string | null;
  caption_cta: string | null;
  caption_hashtags: string[];
};

export function InfoBrandCaptionsCard({
  clientId,
  initial,
}: {
  clientId: string;
  initial: CaptionFields;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<CaptionFields>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [notes, setNotes] = useState(initial.caption_notes ?? '');
  const [cta, setCta] = useState(initial.caption_cta ?? '');
  const [tags, setTags] = useState<string[]>(initial.caption_hashtags ?? []);

  const dirty =
    (notes.trim() || null) !== (saved.caption_notes ?? null) ||
    (cta.trim() || null) !== (saved.caption_cta ?? null) ||
    JSON.stringify(tags) !== JSON.stringify(saved.caption_hashtags ?? []);

  function reset() {
    setNotes(saved.caption_notes ?? '');
    setCta(saved.caption_cta ?? '');
    setTags(saved.caption_hashtags ?? []);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: CaptionFields = {
        caption_notes: notes.trim() || null,
        caption_cta: cta.trim() || null,
        caption_hashtags: tags.map(normalizeHashtag).filter(Boolean),
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
      toast.success('Captions saved');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function draftWithAI() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/captions/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: ['caption_cta', 'caption_hashtags'] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Failed to generate');
        return;
      }
      const s = (data as { suggestions?: { caption_cta?: string; caption_hashtags?: string[] } })
        .suggestions ?? {};
      let touched = false;
      if (typeof s.caption_cta === 'string' && s.caption_cta.trim()) {
        setCta(s.caption_cta.trim());
        touched = true;
      }
      if (Array.isArray(s.caption_hashtags) && s.caption_hashtags.length > 0) {
        setTags(s.caption_hashtags.map(normalizeHashtag).filter(Boolean));
        touched = true;
      }
      if (!touched) {
        toast.info('AI returned no suggestions — add more brand data first.');
        return;
      }
      toast.success('Drafted with AI — review and save.');
    } catch {
      toast.error('Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <InfoCard
      icon={<MessageSquareQuote size={16} />}
      title="Captions"
      description="How Cortex writes captions for this brand — tone guidance plus the verbatim CTA and hashtag wall appended to every AI-written caption."
      state={editing ? 'edit' : 'read'}
      edit={{ onClick: () => setEditing(true) }}
      cancel={{
        onClick: () => {
          reset();
          setEditing(false);
        },
        disabled: saving,
      }}
      save={{ onClick: handleSave, loading: saving, dirty }}
      aiGenerate={
        editing
          ? {
              onClick: draftWithAI,
              loading: generating,
              label: generating ? 'Drafting…' : 'Draft CTA + hashtags',
            }
          : undefined
      }
      footerNote={
        editing
          ? 'AI drafts the verbatim CTA and hashtag wall from the brand profile + website. You can still edit anything before saving.'
          : undefined
      }
    >
      {editing ? (
        <div className="space-y-5">
          <EditTextArea
            label="Caption notes (tone of voice + guidance)"
            value={notes}
            onChange={setNotes}
            rows={4}
            placeholder="e.g. Short sentences. Open with a question. Second-person. Never use 'game-changer'. Keep under 150 chars before the CTA."
          />
          <EditTextArea
            label="CTA (appended verbatim)"
            value={cta}
            onChange={setCta}
            rows={2}
            placeholder="e.g. Book a free consult at nativz.io/book"
          />
          <DraftTagList
            label="Hashtag wall (appended verbatim)"
            values={tags}
            onChange={setTags}
            placeholder="e.g. nativz"
          />
        </div>
      ) : (
        <div className="space-y-5">
          <ReadField
            label="Caption notes"
            value={saved.caption_notes}
            emptyLabel="No tone or structure notes yet — captions follow brand voice only."
          />
          <ReadField
            label="CTA (appended verbatim)"
            value={saved.caption_cta}
            emptyLabel="No verbatim CTA set"
          />
          <ReadHashtags values={saved.caption_hashtags ?? []} />
        </div>
      )}
    </InfoCard>
  );
}

/**
 * Strip a leading '#' from a hashtag and lowercase-trim it. The caption
 * pipeline re-prefixes when rendering, so we store the bare token.
 */
function normalizeHashtag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase();
}

function EditTextArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
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
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  function addTag() {
    const v = normalizeHashtag(draft);
    if (!v || values.includes(v)) {
      setDraft('');
      return;
    }
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
            #{t}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== t))}
              className="text-text-muted hover:text-red-400 transition-colors"
              aria-label={`Remove #${t}`}
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
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
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
  label,
  value,
  emptyLabel,
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
      <p
        className={cn(
          'mt-1.5 text-sm leading-relaxed whitespace-pre-wrap',
          has ? 'text-text-primary' : 'italic text-text-muted',
        )}
      >
        {has ? value : emptyLabel}
      </p>
    </div>
  );
}

function ReadHashtags({ values }: { values: string[] }) {
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        Hashtag wall (appended verbatim)
      </span>
      {values.length === 0 ? (
        <p className="mt-1.5 text-sm italic text-text-muted">No hashtags set</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-nativz-border bg-background px-2.5 py-0.5 text-xs text-text-secondary"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

