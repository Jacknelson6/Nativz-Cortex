'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TagInput } from '@/components/ui/tag-input';
import { PERSON_COLORS } from '@/components/calendar/types';

interface Person {
  id: string;
  displayName: string;
  color: string;
  priorityTier: 1 | 2 | 3;
  sortOrder: number;
  isActive: boolean;
  emails: string[];
}

interface DraftPerson {
  displayName: string;
  color: string;
  priorityTier: 1 | 2 | 3;
  emails: string[];
}

const TIER_COPY: Record<1 | 2 | 3, { label: string; help: string }> = {
  1: { label: 'Tier 1 — Required', help: 'Hard required for slot generation. A meeting cannot be scheduled without them.' },
  2: { label: 'Tier 2 — Preferred', help: 'Surfaces a soft warning when unavailable, but slots can still be picked.' },
  3: { label: 'Tier 3 — Optional', help: 'Free to overlap. Their calendar is informational only.' },
};

const ALLOWED_DOMAINS = ['nativz.io', 'andersoncollaborative.com'];

function isAllowedEmail(email: string): boolean {
  return ALLOWED_DOMAINS.some((d) => email.toLowerCase().endsWith(`@${d}`));
}

export function PeopleManager() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftPerson>({
    displayName: '',
    color: PERSON_COLORS[0],
    priorityTier: 2,
    emails: [],
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/people');
      const data = await res.json();
      setPeople(data.people ?? []);
    } catch {
      toast.error('Failed to load people');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!draft.displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    if (draft.emails.length === 0) {
      toast.error('Add at least one email');
      return;
    }
    const invalid = draft.emails.filter((e) => !isAllowedEmail(e));
    if (invalid.length > 0) {
      toast.error(`Email must be on ${ALLOWED_DOMAINS.join(' or ')}`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/calendar/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to add');
      }
      toast.success(`${draft.displayName} added`);
      setAdding(false);
      setDraft({ displayName: '', color: PERSON_COLORS[0], priorityTier: 2, emails: [] });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setSaving(false);
    }
  }

  async function handlePatch(id: string, updates: Partial<DraftPerson>) {
    const res = await fetch(`/api/calendar/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Failed to update');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the scheduling list?`)) return;
    try {
      const res = await fetch(`/api/calendar/people/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success(`${name} removed`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  // Group by tier
  const grouped: Record<1 | 2 | 3, Person[]> = { 1: [], 2: [], 3: [] };
  for (const p of people) grouped[p.priorityTier].push(p);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/calendar"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={12} />
            Back to calendar
          </Link>
          <h1 className="text-2xl font-semibold text-text-primary">Calendar people</h1>
          <p className="mt-1 text-sm text-text-muted">
            Stakeholders whose calendars overlay the team view, grouped by scheduling priority.
            Service-account driven — email aliases must live on{' '}
            {ALLOWED_DOMAINS.map((d) => `@${d}`).join(' or ')}.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus size={14} />
          Add person
        </Button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6 rounded-lg border border-nativz-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">New person</h2>
            <button
              onClick={() => setAdding(false)}
              className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          <PersonForm
            value={draft}
            onChange={setDraft}
          />

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Tier groups */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : people.length === 0 ? (
        <div className="rounded-lg border border-nativz-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            No people configured. Add one above to start overlaying calendars.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {([1, 2, 3] as const).map((tier) => {
            const group = grouped[tier];
            if (group.length === 0) return null;
            return (
              <section key={tier}>
                <div className="mb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {TIER_COPY[tier].label}
                  </h2>
                  <p className="text-[11px] text-text-muted/80">{TIER_COPY[tier].help}</p>
                </div>
                <div className="space-y-2">
                  {group.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      onPatch={(updates) => handlePatch(person.id, updates).then(load)}
                      onDelete={() => handleDelete(person.id, person.displayName)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Person Card ──────────────────────────────────────────────────────────────

function PersonCard({
  person,
  onPatch,
  onDelete,
}: {
  person: Person;
  onPatch: (updates: Partial<DraftPerson>) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftPerson>({
    displayName: person.displayName,
    color: person.color,
    priorityTier: person.priorityTier,
    emails: person.emails,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const invalid = draft.emails.filter((e) => !isAllowedEmail(e));
    if (invalid.length > 0) {
      toast.error(`Email must be on ${ALLOWED_DOMAINS.join(' or ')}`);
      return;
    }
    setSaving(true);
    try {
      await onPatch(draft);
      toast.success('Saved');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3 hover:border-text-muted/30 transition-colors">
        <div
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: person.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{person.displayName}</div>
          <div className="mt-0.5 text-xs text-text-muted truncate">
            {person.emails.join(', ')}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-red-400 transition-colors"
            aria-label={`Remove ${person.displayName}`}
            title="Remove"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-surface p-4">
      <PersonForm value={draft} onChange={setDraft} />
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(false);
            setDraft({
              displayName: person.displayName,
              color: person.color,
              priorityTier: person.priorityTier,
              emails: person.emails,
            });
          }}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function PersonForm({
  value,
  onChange,
}: {
  value: DraftPerson;
  onChange: (next: DraftPerson) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
        <input
          type="text"
          value={value.displayName}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
          placeholder="Jack Nelson"
          className="w-full rounded-md border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Priority tier</label>
          <select
            value={value.priorityTier}
            onChange={(e) =>
              onChange({ ...value, priorityTier: Number(e.target.value) as 1 | 2 | 3 })
            }
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={1}>1 — Required</option>
            <option value={2}>2 — Preferred</option>
            <option value={3}>3 — Optional</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Color</label>
          <div className="flex flex-wrap gap-1.5">
            {PERSON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ ...value, color: c })}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${
                  value.color === c ? 'scale-110 border-text-primary' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Workspace emails
        </label>
        <TagInput
          value={value.emails}
          onChange={(emails) => onChange({ ...value, emails })}
          placeholder="jack@nativz.io, jack@andersoncollaborative.com"
          maxTags={8}
        />
        <p className="mt-1 text-[11px] text-text-muted">
          Multiple emails union into one calendar overlay (e.g. nativz.io + AC accounts).
          Must be on {ALLOWED_DOMAINS.map((d) => `@${d}`).join(' or ')}.
        </p>
      </div>
    </div>
  );
}
