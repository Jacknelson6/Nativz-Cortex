'use client';

import { useEffect, useState, useTransition } from 'react';
import Image from 'next/image';
import { Building, Globe, Sparkles, Loader2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up — inline edit mode for /brand-profile.
//
// UX model (revised per Jack, 2026-04-21):
//   - Each section card is READ-ONLY by default. You see the brand's
//     data as static, well-formatted text.
//   - A tiny "Edit" button in the top-right of each card unlocks that
//     section's fields. Only that section goes editable — other cards
//     stay locked, so two admins can't clobber each other's work in
//     the same page view.
//   - Save / Cancel buttons appear when editing; Save commits via the
//     brand-profile PATCH and locks back to read mode; Cancel reverts
//     any unsaved typing.
//
// Earlier iteration had "always editable, auto-save on blur" — Jack
// preferred the explicit Edit button so the page reads as information
// until you deliberately say "I want to change this."
//
// Both admin and viewer share /brand-profile; viewer mode passes
// `readOnly` so the same component tree renders without Edit / Save /
// Generate affordances. Layout, tokens, and section shells stay
// identical across roles.

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
  onSaved?: () => void;
  /** Viewer mode — same layout/tokens, no Edit / Save / Generate affordances. */
  readOnly?: boolean;
}

export function BrandProfileInlineEditor({ profile: initialProfile, onSaved, readOnly = false }: Props) {
  const [profile, setProfile] = useState<BrandProfileData>(initialProfile);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  /** Single PATCH helper shared by both section editors. Optimistically
   *  updates local state then rolls back on failure. */
  async function patch(fields: Partial<BrandProfileData>): Promise<boolean> {
    const prev = profile;
    setProfile({ ...profile, ...fields });
    const res = await fetch(`/api/clients/${profile.id}/brand-profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === 'string' ? data.error : 'Failed to save');
      setProfile(prev);
      return false;
    }
    toast.success('Saved', { duration: 1200 });
    onSaved?.();
    return true;
  }

  return (
    <div className="space-y-4">
      <HeaderCard profile={profile} onSave={patch} readOnly={readOnly} />
      <EssenceCard profile={profile} onSave={patch} readOnly={readOnly} />
    </div>
  );
}

// ─── Header card ───────────────────────────────────────────────────────

function HeaderCard({
  profile, onSave, readOnly,
}: {
  profile: BrandProfileData;
  onSave: (fields: Partial<BrandProfileData>) => Promise<boolean>;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft state mirrors the saved profile — only lives while editing.
  const [draft, setDraft] = useState({
    website_url: profile.website_url ?? '',
    description: profile.description ?? '',
    industry: profile.industry ?? '',
    brand_voice: profile.brand_voice ?? '',
    target_audience: profile.target_audience ?? '',
  });

  // Keep the draft in sync if the profile updates from outside (e.g.
  // after a save succeeds and the parent re-renders).
  useEffect(() => {
    if (!editing) {
      setDraft({
        website_url: profile.website_url ?? '',
        description: profile.description ?? '',
        industry: profile.industry ?? '',
        brand_voice: profile.brand_voice ?? '',
        target_audience: profile.target_audience ?? '',
      });
    }
  }, [profile, editing]);

  function cancel() {
    setDraft({
      website_url: profile.website_url ?? '',
      description: profile.description ?? '',
      industry: profile.industry ?? '',
      brand_voice: profile.brand_voice ?? '',
      target_audience: profile.target_audience ?? '',
    });
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    const ok = await onSave({
      website_url: draft.website_url.trim() || null,
      description: draft.description.trim() || null,
      industry: draft.industry.trim() || null,
      brand_voice: draft.brand_voice.trim() || null,
      target_audience: draft.target_audience.trim() || null,
    });
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-6 relative">
      {!readOnly && (
        <EditButtonRow
          editing={editing}
          saving={saving}
          onEdit={() => setEditing(true)}
          onSave={save}
          onCancel={cancel}
        />
      )}

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
          <h1 className="text-2xl font-semibold text-text-primary truncate pr-24">
            {profile.name ?? 'Brand profile'}
          </h1>

          {/* Website */}
          <LabelledField icon={<Globe size={12} />} label="Website">
            {editing ? (
              <input
                type="text"
                value={draft.website_url}
                onChange={(e) => setDraft((d) => ({ ...d, website_url: e.target.value }))}
                placeholder="https://yourbrand.com"
                className={inputClass}
              />
            ) : profile.website_url ? (
              <a
                href={profile.website_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-accent-text hover:underline break-all"
              >
                {profile.website_url}
              </a>
            ) : (
              <ReadEmpty>No website set</ReadEmpty>
            )}
          </LabelledField>

          {/* Description */}
          <LabelledField label="Description">
            {editing ? (
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
                placeholder="A one-paragraph intro to the brand…"
                className={textareaClass}
              />
            ) : profile.description ? (
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                {profile.description}
              </p>
            ) : (
              <ReadEmpty>No description yet</ReadEmpty>
            )}
          </LabelledField>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-nativz-border">
        <LabelledField label="Industry">
          {editing ? (
            <input
              type="text"
              value={draft.industry}
              onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value }))}
              placeholder="e.g. Specialty Coffee"
              className={inputClass}
            />
          ) : profile.industry ? (
            <ReadValue>{profile.industry}</ReadValue>
          ) : (
            <ReadEmpty>Not set</ReadEmpty>
          )}
        </LabelledField>
        <LabelledField label="Brand voice">
          {editing ? (
            <input
              type="text"
              value={draft.brand_voice}
              onChange={(e) => setDraft((d) => ({ ...d, brand_voice: e.target.value }))}
              placeholder="Warm, confident, witty"
              className={inputClass}
            />
          ) : profile.brand_voice ? (
            <ReadValue>{profile.brand_voice}</ReadValue>
          ) : (
            <ReadEmpty>Not set</ReadEmpty>
          )}
        </LabelledField>
        <LabelledField label="Target audience">
          {editing ? (
            <input
              type="text"
              value={draft.target_audience}
              onChange={(e) => setDraft((d) => ({ ...d, target_audience: e.target.value }))}
              placeholder="Who it's for"
              className={inputClass}
            />
          ) : profile.target_audience ? (
            <ReadValue>{profile.target_audience}</ReadValue>
          ) : (
            <ReadEmpty>Not set</ReadEmpty>
          )}
        </LabelledField>
      </div>
    </section>
  );
}

// ─── Essence card ──────────────────────────────────────────────────────

function EssenceCard({
  profile, onSave, readOnly,
}: {
  profile: BrandProfileData;
  onSave: (fields: Partial<BrandProfileData>) => Promise<boolean>;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [, startTransition] = useTransition();

  const [draft, setDraft] = useState({
    tagline: profile.tagline ?? '',
    value_proposition: profile.value_proposition ?? '',
    mission_statement: profile.mission_statement ?? '',
  });

  useEffect(() => {
    if (!editing) {
      setDraft({
        tagline: profile.tagline ?? '',
        value_proposition: profile.value_proposition ?? '',
        mission_statement: profile.mission_statement ?? '',
      });
    }
  }, [profile, editing]);

  function cancel() {
    setDraft({
      tagline: profile.tagline ?? '',
      value_proposition: profile.value_proposition ?? '',
      mission_statement: profile.mission_statement ?? '',
    });
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    const ok = await onSave({
      tagline: draft.tagline.trim() || null,
      value_proposition: draft.value_proposition.trim() || null,
      mission_statement: draft.mission_statement.trim() || null,
    });
    setSaving(false);
    if (ok) setEditing(false);
  }

  /** Generate pulls from description / industry / brand guideline and
   *  drafts all three essence fields in one call. Writes straight to
   *  the draft so the admin can review + edit before saving. Does NOT
   *  auto-save — the admin clicks Save to commit. */
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
      if (!s.tagline && !s.value_proposition && !s.mission_statement) {
        toast.info('AI returned no suggestions — add more brand data first.');
        return;
      }
      startTransition(() => {
        setDraft((d) => ({
          tagline: s.tagline ?? d.tagline,
          value_proposition: s.value_proposition ?? d.value_proposition,
          mission_statement: s.mission_statement ?? d.mission_statement,
        }));
      });
      toast.success('Generated — review and click Save to commit');
    } catch {
      toast.error('Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  const hasAnyEssence = !!(profile.tagline || profile.value_proposition || profile.mission_statement);

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-6 relative">
      {!readOnly && (
        <EditButtonRow
          editing={editing}
          saving={saving}
          onEdit={() => setEditing(true)}
          onSave={save}
          onCancel={cancel}
        />
      )}

      <header className="flex items-start gap-3 pr-24">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">Brand essence</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Tagline, value prop, and mission — the brand&apos;s story in three beats.
          </p>
        </div>
      </header>

      <div className="mt-5 space-y-4">
        {/* Tagline */}
        <LabelledField label="Tagline">
          {editing ? (
            <input
              type="text"
              value={draft.tagline}
              onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
              placeholder="Funded by real estate investors."
              className={inputClass}
            />
          ) : profile.tagline ? (
            <p className="text-xl font-semibold text-text-primary leading-tight">
              {profile.tagline}
            </p>
          ) : (
            <ReadEmpty>No tagline yet</ReadEmpty>
          )}
        </LabelledField>

        {/* Value proposition */}
        <LabelledField label="Value proposition">
          {editing ? (
            <textarea
              value={draft.value_proposition}
              onChange={(e) => setDraft((d) => ({ ...d, value_proposition: e.target.value }))}
              rows={2}
              placeholder="What specific outcome you deliver for your audience."
              className={textareaClass}
            />
          ) : profile.value_proposition ? (
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {profile.value_proposition}
            </p>
          ) : (
            <ReadEmpty>No value proposition yet</ReadEmpty>
          )}
        </LabelledField>

        {/* Mission statement */}
        <LabelledField label="Mission statement">
          {editing ? (
            <textarea
              value={draft.mission_statement}
              onChange={(e) => setDraft((d) => ({ ...d, mission_statement: e.target.value }))}
              rows={3}
              placeholder="Why the brand exists — long-term intent, not tactics."
              className={textareaClass}
            />
          ) : profile.mission_statement ? (
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {profile.mission_statement}
            </p>
          ) : (
            <ReadEmpty>No mission yet</ReadEmpty>
          )}
        </LabelledField>

        {/* Generate-with-AI — only visible in edit mode. The button
            lives at the BOTTOM of the editing panel so it reads as
            an action on the form, not a section header. Populates
            the draft; admin reviews + clicks Save. */}
        {editing && (
          <div className="pt-2 border-t border-nativz-border flex items-center justify-between gap-3">
            <p className="text-[11px] text-text-muted leading-relaxed">
              {hasAnyEssence
                ? 'AI will re-draft these from description, industry, voice, and brand DNA.'
                : 'AI drafts tagline + value prop + mission from description, industry, voice, and brand DNA.'}
            </p>
            <button
              onClick={() => void generateEssence()}
              disabled={generating}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent-text/30 bg-accent-text/5 px-3 py-1.5 text-xs text-accent-text hover:bg-accent-text/10 disabled:opacity-50"
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generating ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Presentation primitives ──────────────────────────────────────────

/**
 * Top-right action row. Default view shows a subtle "Edit" button;
 * active edit mode shows Save + Cancel. Positioned absolute inside
 * the parent card so the content flow doesn't need to reserve space.
 */
function EditButtonRow({
  editing, saving, onEdit, onSave, onCancel,
}: {
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}) {
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface-hover px-3 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-accent/40 transition"
        aria-label="Edit section"
      >
        <Pencil size={11} /> Edit
      </button>
    );
  }
  return (
    <div className="absolute top-4 right-4 flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface-hover px-3 py-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-40"
      >
        <X size={11} /> Cancel
      </button>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-full bg-accent-text text-background px-3 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-40"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function LabelledField({
  icon, label, children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-primary leading-relaxed">{children}</p>;
}

function ReadEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-muted italic">{children}</p>;
}

const inputClass =
  'w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors';

const textareaClass =
  'w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors resize-y leading-relaxed';
