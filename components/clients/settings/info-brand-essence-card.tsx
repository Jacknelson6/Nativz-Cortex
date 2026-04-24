'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { InfoCard, InfoField } from './info-card';

/**
 * InfoBrandEssenceCard — the tagline / value-prop / mission trio, read-first
 * with an explicit Cancel + Save pair in the header and "Generate with AI" in
 * the footer when editing. Matches the edit-state screenshot Jack pinned.
 *
 * AI generate drafts all three fields from the brand's existing data
 * (description, industry, voice, brand DNA) and populates the draft
 * inputs — user can edit before saving.
 */

type EssencePayload = {
  tagline: string | null;
  value_proposition: string | null;
  mission_statement: string | null;
};

const EMPTY: EssencePayload = {
  tagline: null,
  value_proposition: null,
  mission_statement: null,
};

export function InfoBrandEssenceCard({ clientId }: { clientId: string }) {
  const [saved, setSaved] = useState<EssencePayload | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tagline, setTagline] = useState('');
  const [valueProp, setValueProp] = useState('');
  const [mission, setMission] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/brand-profile`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        const next: EssencePayload = {
          tagline: data.profile?.tagline ?? null,
          value_proposition: data.profile?.value_proposition ?? null,
          mission_statement: data.profile?.mission_statement ?? null,
        };
        setSaved(next);
        setTagline(next.tagline ?? '');
        setValueProp(next.value_proposition ?? '');
        setMission(next.mission_statement ?? '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  function resetDrafts(from: EssencePayload) {
    setTagline(from.tagline ?? '');
    setValueProp(from.value_proposition ?? '');
    setMission(from.mission_statement ?? '');
  }

  const current = saved ?? EMPTY;
  const dirty =
    (tagline.trim() || null) !== (current.tagline ?? null) ||
    (valueProp.trim() || null) !== (current.value_proposition ?? null) ||
    (mission.trim() || null) !== (current.mission_statement ?? null);

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        tagline: tagline.trim() || null,
        value_proposition: valueProp.trim() || null,
        mission_statement: mission.trim() || null,
      };
      const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || 'Failed to save');
        return;
      }
      const next: EssencePayload = body;
      setSaved(next);
      setEditing(false);
      toast.success('Brand essence saved');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-essence/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fields: ['tagline', 'value_proposition', 'mission_statement'],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Failed to generate');
        return;
      }
      const s = data.suggestions ?? {};
      let touched = 0;
      if (typeof s.tagline === 'string' && s.tagline) { setTagline(s.tagline); touched++; }
      if (typeof s.value_proposition === 'string' && s.value_proposition) {
        setValueProp(s.value_proposition); touched++;
      }
      if (typeof s.mission_statement === 'string' && s.mission_statement) {
        setMission(s.mission_statement); touched++;
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

  if (error) {
    return (
      <InfoCard icon={<Sparkles size={16} />} title="Brand essence">
        <p className="text-sm text-red-400">{error}</p>
      </InfoCard>
    );
  }

  if (!saved) {
    return (
      <InfoCard icon={<Sparkles size={16} />} title="Brand essence">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
          <div className="h-6 w-full bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse mt-4" />
          <div className="h-10 w-full bg-surface-hover rounded animate-pulse" />
        </div>
      </InfoCard>
    );
  }

  return (
    <InfoCard
      icon={<Sparkles size={16} />}
      title="Brand essence"
      description="Tagline, value prop, and mission — the brand's story in three beats."
      state={editing ? 'edit' : 'read'}
      edit={{ onClick: () => setEditing(true) }}
      cancel={{
        onClick: () => { resetDrafts(current); setEditing(false); },
        disabled: saving,
      }}
      save={{
        onClick: handleSave,
        loading: saving,
        dirty,
      }}
      aiGenerate={{
        onClick: handleGenerate,
        loading: generating,
      }}
      footerNote="AI will re-draft these from description, industry, voice, and brand DNA."
    >
      {editing ? (
        <div className="space-y-5">
          <EditTextLine
            label="Tagline"
            value={tagline}
            onChange={setTagline}
            placeholder="Work, create, host seamlessly."
          />
          <EditTextArea
            label="Value proposition"
            value={valueProp}
            onChange={setValueProp}
            rows={3}
            placeholder="What specific outcome you deliver for your audience."
          />
          <EditTextArea
            label="Mission statement"
            value={mission}
            onChange={setMission}
            rows={4}
            placeholder="Why the brand exists — long-term intent, not tactics."
          />
        </div>
      ) : (
        <div className="space-y-5">
          <InfoField label="Tagline" value={current.tagline} emptyLabel="No tagline yet" />
          <InfoField label="Value proposition" value={current.value_proposition} emptyLabel="No value proposition yet" />
          <InfoField label="Mission statement" value={current.mission_statement} emptyLabel="No mission statement yet" />
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
