'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Users, Loader2 } from 'lucide-react';
import { InfoCard } from './info-card';

/**
 * InfoAssignedTeamCard — account-level strategist + editor assignment for a
 * client. These two values auto-populate `editing_projects.strategist_id`
 * and `editing_projects.editor_id` on every new project creation (manual
 * and cron), so the team doesn't have to pick on every drop. Strategists
 * and editors are sourced from `team_members` filtered by their
 * `editing_roles` tag.
 *
 * Read-first with a single Cancel/Save pair; rosters are fetched on entry
 * to edit mode so the dropdown lists stay fresh. Storing null clears the
 * default and new projects fall back to the legacy behavior (creator as
 * editor, no strategist).
 */

type Assignees = {
  default_strategist_id: string | null;
  default_editor_id: string | null;
};

type Member = {
  id: string;
  full_name: string | null;
  email: string;
};

type InitialMember = Member | null;

export function InfoAssignedTeamCard({
  clientId,
  initial,
  initialStrategist,
  initialEditor,
}: {
  clientId: string;
  initial: Assignees;
  initialStrategist: InitialMember;
  initialEditor: InitialMember;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Assignees>(initial);
  const [savedStrategist, setSavedStrategist] = useState<InitialMember>(initialStrategist);
  const [savedEditor, setSavedEditor] = useState<InitialMember>(initialEditor);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [strategistId, setStrategistId] = useState<string | null>(initial.default_strategist_id);
  const [editorId, setEditorId] = useState<string | null>(initial.default_editor_id);

  const [strategistOptions, setStrategistOptions] = useState<Member[]>([]);
  const [editorOptions, setEditorOptions] = useState<Member[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const dirty =
    strategistId !== saved.default_strategist_id ||
    editorId !== saved.default_editor_id;

  useEffect(() => {
    if (!editing || optionsLoaded || loadingOptions) return;
    let cancelled = false;
    setLoadingOptions(true);
    Promise.all([
      fetch('/api/admin/editing/team?role=strategist'),
      fetch('/api/admin/editing/team?role=editor'),
    ])
      .then(async ([sRes, eRes]) => {
        const sData = (await sRes.json().catch(() => ({}))) as { members?: Member[] };
        const eData = (await eRes.json().catch(() => ({}))) as { members?: Member[] };
        if (cancelled) return;
        setStrategistOptions(sData.members ?? []);
        setEditorOptions(eData.members ?? []);
        setOptionsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load team roster');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, optionsLoaded, loadingOptions]);

  function reset() {
    setStrategistId(saved.default_strategist_id);
    setEditorId(saved.default_editor_id);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Assignees = {
        default_strategist_id: strategistId,
        default_editor_id: editorId,
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
      setSavedStrategist(strategistOptions.find((m) => m.id === strategistId) ?? null);
      setSavedEditor(editorOptions.find((m) => m.id === editorId) ?? null);
      setEditing(false);
      toast.success('Default team saved');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <InfoCard
      icon={<Users size={16} />}
      title="Assigned team"
      description="Default strategist + editor for this client. Auto-fills on every new editing project and calendar drop so nothing ships unassigned."
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
    >
      {editing ? (
        <div className="space-y-5">
          {loadingOptions && !optionsLoaded ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 size={12} className="animate-spin" /> Loading roster…
            </div>
          ) : (
            <>
              <AssigneeSelect
                label="Default strategist"
                value={strategistId}
                onChange={setStrategistId}
                options={strategistOptions}
                emptyLabel="No strategists tagged in team_members yet"
              />
              <AssigneeSelect
                label="Default editor"
                value={editorId}
                onChange={setEditorId}
                options={editorOptions}
                emptyLabel="No editors tagged in team_members yet"
              />
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <ReadAssignee label="Strategist" member={savedStrategist} />
          <ReadAssignee label="Editor" member={savedEditor} />
        </div>
      )}
    </InfoCard>
  );
}

function AssigneeSelect({
  label,
  value,
  onChange,
  options,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  options: Member[];
  emptyLabel: string;
}) {
  const hasOptions = options.length > 0;
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!hasOptions}
        className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 transition-colors"
      >
        <option value="">— Unassigned —</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {memberDisplay(m)}
          </option>
        ))}
      </select>
      {!hasOptions && (
        <p className="mt-1.5 text-[11px] italic text-text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

function ReadAssignee({ label, member }: { label: string; member: InitialMember }) {
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      {member ? (
        <p className="mt-1.5 text-sm text-text-primary">{memberDisplay(member)}</p>
      ) : (
        <p className="mt-1.5 text-sm italic text-text-muted">No default</p>
      )}
    </div>
  );
}

function memberDisplay(m: Member): string {
  const name = (m.full_name ?? '').trim();
  if (name) return name;
  return m.email || 'Unnamed';
}
