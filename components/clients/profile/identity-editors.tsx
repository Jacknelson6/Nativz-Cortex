'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import {
  SectionEditor,
  EditorField,
  editorInputClass,
  editorTextareaClass,
} from './section-editor';

type BasicsDraft = {
  name: string;
  website_url: string;
  industry: string;
  description: string;
};

export function BasicsEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: BasicsDraft;
}) {
  return (
    <SectionEditor<BasicsDraft>
      title="Basics"
      description="The bare facts the team needs to load this brand."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      validate={(d) => (d.name.trim() ? null : 'Brand name is required')}
      buildBody={(d) => ({
        // `name` lives on the main /api/clients/[id] PATCH; brand-profile
        // intentionally omits it. We patch it separately below.
        website_url: d.website_url.trim() || null,
        industry: d.industry.trim() || null,
        description: d.description.trim() || null,
      })}
    >
      {(d, set) => (
        <>
          <EditorField label="Brand name" hint="Renames flow through to the vault and Monday.com.">
            <input
              type="text"
              value={d.name}
              onChange={(e) => set({ name: e.target.value })}
              onBlur={async () => {
                // Name has ripple effects, so it goes through the main client
                // PATCH the moment the input blurs (not on Save). Skip if
                // unchanged.
                if (d.name.trim() && d.name.trim() !== initial.name) {
                  await fetch(`/api/clients/${clientId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: d.name.trim() }),
                  }).catch(() => {});
                }
              }}
              className={editorInputClass}
            />
          </EditorField>
          <EditorField label="Website" hint="https://…">
            <input
              type="url"
              value={d.website_url}
              onChange={(e) => set({ website_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://example.com"
            />
          </EditorField>
          <EditorField label="Industry">
            <input
              type="text"
              value={d.industry}
              onChange={(e) => set({ industry: e.target.value })}
              className={editorInputClass}
              placeholder="DTC beverage, agency, etc."
            />
          </EditorField>
          <EditorField
            label="Description"
            hint="A short paragraph the AI uses for context on every generation."
          >
            <textarea
              value={d.description}
              onChange={(e) => set({ description: e.target.value })}
              className={editorTextareaClass}
              rows={5}
            />
          </EditorField>
        </>
      )}
    </SectionEditor>
  );
}

type VoiceDraft = {
  brand_voice: string;
  target_audience: string;
  writing_style: string;
  banned_phrases: string[];
};

export function VoiceEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: VoiceDraft;
}) {
  return (
    <SectionEditor<VoiceDraft>
      title="Voice & audience"
      description="Tone, audience, and the phrases the AI must never use."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({
        brand_voice: d.brand_voice.trim() || null,
        target_audience: d.target_audience.trim() || null,
        writing_style: d.writing_style.trim() || null,
        banned_phrases: d.banned_phrases.map((p) => p.trim()).filter(Boolean),
      })}
    >
      {(d, set) => (
        <>
          <EditorField label="Brand voice" hint="e.g. warm + confident, irreverent, technical.">
            <textarea
              value={d.brand_voice}
              onChange={(e) => set({ brand_voice: e.target.value })}
              className={editorTextareaClass}
              rows={3}
            />
          </EditorField>
          <EditorField label="Target audience">
            <textarea
              value={d.target_audience}
              onChange={(e) => set({ target_audience: e.target.value })}
              className={editorTextareaClass}
              rows={3}
            />
          </EditorField>
          <EditorField label="Writing style notes" hint="Sentence length, formatting preferences, etc.">
            <textarea
              value={d.writing_style}
              onChange={(e) => set({ writing_style: e.target.value })}
              className={editorTextareaClass}
              rows={3}
            />
          </EditorField>
          <EditorField label="Banned phrases" hint="One per row. AI will avoid these verbatim.">
            <TagListEditor
              values={d.banned_phrases}
              onChange={(next) => set({ banned_phrases: next })}
              placeholder="Add a banned phrase"
            />
          </EditorField>
        </>
      )}
    </SectionEditor>
  );
}

type CaptionsDraft = {
  caption_cta: string;
  caption_hashtags: string[];
  caption_notes: string;
  hashtag_notes: string;
  cta_notes: string;
};

export function CaptionsEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: CaptionsDraft;
}) {
  return (
    <SectionEditor<CaptionsDraft>
      title="Captions"
      description="Boilerplate appended verbatim to generated captions, plus guidance the AI uses when drafting them."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({
        caption_cta: d.caption_cta.trim() || null,
        caption_hashtags: d.caption_hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean),
        caption_notes: d.caption_notes.trim() || null,
        hashtag_notes: d.hashtag_notes.trim() || null,
        cta_notes: d.cta_notes.trim() || null,
      })}
    >
      {(d, set) => (
        <>
          <EditorField label="CTA" hint="Trailing call to action appended to every caption.">
            <input
              type="text"
              value={d.caption_cta}
              onChange={(e) => set({ caption_cta: e.target.value })}
              className={editorInputClass}
              placeholder="Tap the link in bio"
            />
          </EditorField>
          <EditorField label="Hashtags" hint="Lead with or without #. We strip leading # automatically.">
            <TagListEditor
              values={d.caption_hashtags}
              onChange={(next) => set({ caption_hashtags: next })}
              placeholder="Add a hashtag"
            />
          </EditorField>
          <EditorField label="Caption notes" hint="Tone / structure guidance — used as prompt context, not appended.">
            <textarea
              value={d.caption_notes}
              onChange={(e) => set({ caption_notes: e.target.value })}
              className={editorTextareaClass}
              rows={3}
            />
          </EditorField>
          <EditorField label="Hashtag notes">
            <textarea
              value={d.hashtag_notes}
              onChange={(e) => set({ hashtag_notes: e.target.value })}
              className={editorTextareaClass}
              rows={2}
            />
          </EditorField>
          <EditorField label="CTA notes">
            <textarea
              value={d.cta_notes}
              onChange={(e) => set({ cta_notes: e.target.value })}
              className={editorTextareaClass}
              rows={2}
            />
          </EditorField>
        </>
      )}
    </SectionEditor>
  );
}

type ProductsDraft = { products: string[] };

export function ProductsEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: ProductsDraft;
}) {
  return (
    <SectionEditor<ProductsDraft>
      title="Products"
      description="The product names the team should weight in scripts and captions. Onboarding scrape will eventually populate richer rows here."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({ products: d.products.map((p) => p.trim()).filter(Boolean) })}
    >
      {(d, set) => (
        <EditorField label="Products" hint="One per row.">
          <TagListEditor
            values={d.products}
            onChange={(next) => set({ products: next })}
            placeholder="Add a product"
          />
        </EditorField>
      )}
    </SectionEditor>
  );
}

type AliasesDraft = { brand_aliases: string[] };

export function AliasesEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: AliasesDraft;
}) {
  return (
    <SectionEditor<AliasesDraft>
      title="Brand aliases"
      description="Alternate names, abbreviations, or misspellings the team uses for this brand."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({
        brand_aliases: d.brand_aliases.map((a) => a.trim()).filter(Boolean),
      })}
    >
      {(d, set) => (
        <EditorField label="Aliases">
          <TagListEditor
            values={d.brand_aliases}
            onChange={(next) => set({ brand_aliases: next })}
            placeholder="Add an alias"
          />
        </EditorField>
      )}
    </SectionEditor>
  );
}

function TagListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [pending, setPending] = useState('');

  function add() {
    const v = pending.trim();
    if (!v) return;
    if (values.includes(v)) {
      setPending('');
      return;
    }
    onChange([...values, v]);
    setPending('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && (
          <span className="text-xs italic text-text-muted">None yet</span>
        )}
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-background px-2 py-0.5 text-xs text-text-secondary"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-text-muted hover:text-text-primary"
              aria-label={`Remove ${v}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className={editorInputClass}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-nativz-border bg-background px-2.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover"
        >
          <Plus size={12} />
          Add
        </button>
      </div>
    </div>
  );
}
