'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SectionEditor, EditorField } from './section-editor';

type TeamDraft = {
  default_strategist_id: string | null;
  default_editor_id: string | null;
};

type Member = { id: string; full_name: string | null; email: string };

const selectClass =
  'w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50';

export function TeamEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: TeamDraft;
}) {
  return (
    <SectionEditor<TeamDraft>
      title="Assigned team"
      description="Auto-fills on every new editing project + calendar drop so nothing ships unassigned."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({
        default_strategist_id: d.default_strategist_id,
        default_editor_id: d.default_editor_id,
      })}
    >
      {(d, set) => <RosterFields draft={d} set={set} />}
    </SectionEditor>
  );
}

function RosterFields({
  draft,
  set,
}: {
  draft: TeamDraft;
  set: (patch: Partial<TeamDraft>) => void;
}) {
  const [strategists, setStrategists] = useState<Member[]>([]);
  const [editors, setEditors] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/admin/editing/team?role=strategist'),
      fetch('/api/admin/editing/team?role=editor'),
    ])
      .then(async ([sRes, eRes]) => {
        const sData = (await sRes.json().catch(() => ({}))) as { members?: Member[] };
        const eData = (await eRes.json().catch(() => ({}))) as { members?: Member[] };
        if (cancelled) return;
        setStrategists(sData.members ?? []);
        setEditors(eData.members ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load team roster');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin" /> Loading roster…
      </div>
    );
  }

  return (
    <>
      {error && <div className="text-xs text-rose-300">{error}</div>}
      <EditorField label="Default strategist">
        <select
          value={draft.default_strategist_id ?? ''}
          onChange={(e) => set({ default_strategist_id: e.target.value || null })}
          className={selectClass}
        >
          <option value="">— Unassigned —</option>
          {strategists.map((m) => (
            <option key={m.id} value={m.id}>
              {display(m)}
            </option>
          ))}
        </select>
        {strategists.length === 0 && (
          <p className="text-[11px] italic text-text-muted">
            No strategists tagged in team_members yet.
          </p>
        )}
      </EditorField>
      <EditorField label="Default editor">
        <select
          value={draft.default_editor_id ?? ''}
          onChange={(e) => set({ default_editor_id: e.target.value || null })}
          className={selectClass}
        >
          <option value="">— Unassigned —</option>
          {editors.map((m) => (
            <option key={m.id} value={m.id}>
              {display(m)}
            </option>
          ))}
        </select>
        {editors.length === 0 && (
          <p className="text-[11px] italic text-text-muted">
            No editors tagged in team_members yet.
          </p>
        )}
      </EditorField>
    </>
  );
}

function display(m: Member): string {
  const name = (m.full_name ?? '').trim();
  return name || m.email || 'Unnamed';
}
