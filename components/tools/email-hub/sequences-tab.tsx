'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, UserPlus, Zap } from 'lucide-react';
import { LabeledInput, ModalShell } from './contacts-tab';

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  agency: 'nativz' | 'anderson' | null;
  active: boolean;
  step_count: number;
  enrollment_count: number;
  created_at: string;
};

type Step = {
  step_order: number;
  delay_days: number;
  subject: string;
  body_markdown: string;
  stop_on_reply: boolean;
};

type EmailList = { id: string; name: string };
type ContactLite = { id: string; email: string; full_name: string | null };

export function SequencesTab() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/email-hub/sequences');
    const json = await res.json();
    setSequences((json.sequences ?? []) as Sequence[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (selectedId) {
    return (
      <SequenceDetailView
        id={selectedId}
        onBack={() => {
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-nativz-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <Zap size={15} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Email sequences</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {sequences.length} sequence{sequences.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={13} />
          Create new
        </button>
      </header>

      {loading ? (
        <div className="p-12 text-center text-sm text-text-muted">Loading sequences…</div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
            <Zap size={22} className="text-accent-text" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">No sequences yet</h3>
            <p className="mt-1 max-w-md text-sm text-text-muted">
              Create automated email sequences with follow-ups and conditions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
          >
            <Plus size={14} />
            Create new sequence
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {sequences.map((s) => (
            <li
              key={s.id}
              className="px-5 py-3.5 flex items-center gap-3 hover:bg-surface/40 cursor-pointer"
              onClick={() => setSelectedId(s.id)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface border border-nativz-border text-accent-text">
                <Zap size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
                  {!s.active && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                      Paused
                    </span>
                  )}
                </div>
                {s.description ? (
                  <p className="text-xs text-text-muted truncate mt-0.5">{s.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-4 text-xs text-text-muted shrink-0 tabular-nums">
                <span>{s.step_count} step{s.step_count === 1 ? '' : 's'}</span>
                <span>{s.enrollment_count} enrolled</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateSequenceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function CreateSequenceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agency, setAgency] = useState<'nativz' | 'anderson' | ''>('');
  const [steps, setSteps] = useState<Step[]>([
    { step_order: 0, delay_days: 0, subject: '', body_markdown: '', stop_on_reply: true },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        step_order: prev.length,
        delay_days: 3,
        subject: '',
        body_markdown: '',
        stop_on_reply: true,
      },
    ]);
  }
  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i })));
  }
  function patch(idx: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/email-hub/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || null,
        agency: agency || null,
        steps,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'Failed to create sequence');
      return;
    }
    onCreated();
  }

  const canSave =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => s.subject.trim() && s.body_markdown.trim());

  return (
    <ModalShell title="New sequence" onClose={onClose}>
      <div className="space-y-3">
        <LabeledInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="New-client welcome drip"
          autoFocus
        />
        <div className="grid grid-cols-[1fr_160px] gap-3">
          <LabeledInput
            label="Description (optional)"
            value={description}
            onChange={setDescription}
            placeholder="What this sequence does"
          />
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Agency
            </span>
            <select
              value={agency}
              onChange={(e) => setAgency(e.target.value as 'nativz' | 'anderson' | '')}
              className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Auto</option>
              <option value="nativz">Nativz</option>
              <option value="anderson">Anderson</option>
            </select>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Steps
            </span>
            <button
              type="button"
              onClick={addStep}
              className="text-xs text-accent-text hover:text-accent inline-flex items-center gap-1"
            >
              <Plus size={12} />
              Add step
            </button>
          </div>
          <div className="space-y-3 max-h-[45vh] overflow-y-auto">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-nativz-border bg-surface/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text-primary">Step {idx + 1}</p>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="text-xs text-text-muted hover:text-rose-500 inline-flex items-center gap-1"
                    >
                      <Trash2 size={11} />
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <label className="block">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                      Delay (days)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={s.delay_days}
                      onChange={(e) => patch(idx, { delay_days: Number(e.target.value) })}
                      className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                      Subject
                    </span>
                    <input
                      type="text"
                      value={s.subject}
                      onChange={(e) => patch(idx, { subject: e.target.value })}
                      placeholder="Hey {{user.first_name}}…"
                      className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                </div>
                <textarea
                  value={s.body_markdown}
                  onChange={(e) => patch(idx, { body_markdown: e.target.value })}
                  rows={4}
                  placeholder="Body (markdown)…"
                  className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                />
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={s.stop_on_reply}
                    onChange={(e) => patch(idx, { stop_on_reply: e.target.checked })}
                    className="h-4 w-4 rounded border-nativz-border accent-accent"
                  />
                  Stop if they reply to an earlier step
                </label>
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="text-xs text-rose-500">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !canSave}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create sequence'}
        </button>
      </div>
    </ModalShell>
  );
}

function SequenceDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  type Detail = {
    sequence: Sequence;
    steps: (Step & { id: string })[];
    enrollments: {
      id: string;
      current_step: number;
      status: string;
      enrolled_at: string;
      next_send_at: string | null;
      contact: { id: string; email: string; full_name: string | null } | null;
    }[];
  };

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEnroll, setShowEnroll] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/email-hub/sequences/${id}`);
    const json = await res.json();
    setData(json as Detail);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function togglePause() {
    if (!data) return;
    await fetch(`/api/admin/email-hub/sequences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !data.sequence.active }),
    });
    load();
  }

  async function remove() {
    if (!confirm('Delete this sequence? Active enrollments will be dropped.')) return;
    await fetch(`/api/admin/email-hub/sequences/${id}`, { method: 'DELETE' });
    onBack();
  }

  if (loading || !data) {
    return (
      <section className="rounded-2xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-muted">
        Loading…
      </section>
    );
  }

  const { sequence, steps, enrollments } = data;

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-nativz-border">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-nativz-border bg-background text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary truncate">
              {sequence.name}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {steps.length} step{steps.length === 1 ? '' : 's'} · {enrollments.length}{' '}
              enrolled
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEnroll(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
          >
            <UserPlus size={13} />
            Enroll contacts
          </button>
          <button
            type="button"
            onClick={togglePause}
            className="rounded-full border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            {sequence.active ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={remove}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/20"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1.2fr_1fr] divide-x divide-nativz-border">
        <div className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Steps
          </h3>
          <ol className="space-y-3">
            {steps.map((s, idx) => (
              <li key={s.id ?? idx} className="rounded-xl border border-nativz-border bg-surface/40 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-text-primary">
                    Step {idx + 1}
                  </p>
                  <span className="text-xs text-text-muted">
                    {s.delay_days === 0
                      ? 'Immediately'
                      : `Day ${s.delay_days} after enroll${idx > 0 ? 'ment step' : ''}`}
                  </span>
                </div>
                <p className="text-sm text-text-primary mt-1.5">{s.subject}</p>
                <p className="text-xs text-text-muted mt-1.5 line-clamp-3 whitespace-pre-line">
                  {s.body_markdown}
                </p>
                {s.stop_on_reply && (
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mt-2">
                    Stops on reply
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Enrollments
          </h3>
          {enrollments.length === 0 ? (
            <p className="text-sm text-text-muted">No contacts enrolled yet.</p>
          ) : (
            <ul className="divide-y divide-nativz-border">
              {enrollments.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {e.contact?.full_name || e.contact?.email || 'Unknown'}
                    </p>
                    <StatusPill status={e.status} />
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Step {e.current_step + 1}
                    {e.next_send_at
                      ? ` · next ${new Date(e.next_send_at).toLocaleDateString()}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showEnroll && (
        <EnrollModal
          sequenceId={id}
          onClose={() => setShowEnroll(false)}
          onEnrolled={() => {
            setShowEnroll(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    completed: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
    stopped: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    paused: 'bg-text-muted/10 text-text-muted border-nativz-border',
  };
  const cls = map[status] ?? 'bg-surface text-text-muted border-nativz-border';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

function EnrollModal({
  sequenceId,
  onClose,
  onEnrolled,
}: {
  sequenceId: string;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'list' | 'contacts'>('contacts');
  const [listId, setListId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/email-hub/lists')
      .then((r) => r.json())
      .then((j) => setLists((j.lists ?? []) as EmailList[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    params.set('limit', '200');
    fetch(`/api/admin/email-hub/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setContacts((j.contacts ?? []) as ContactLite[]))
      .catch(() => {});
  }, [search]);

  async function submit() {
    setBusy(true);
    const payload =
      mode === 'list' ? { list_id: listId } : { contact_ids: Array.from(selected) };
    await fetch(`/api/admin/email-hub/sequences/${sequenceId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    onEnrolled();
  }

  return (
    <ModalShell title="Enroll contacts" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMode('contacts')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            mode === 'contacts'
              ? 'bg-accent text-white'
              : 'border border-nativz-border bg-background text-text-secondary'
          }`}
        >
          Pick contacts
        </button>
        <button
          type="button"
          onClick={() => setMode('list')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            mode === 'list'
              ? 'bg-accent text-white'
              : 'border border-nativz-border bg-background text-text-secondary'
          }`}
        >
          Use a list
        </button>
      </div>

      {mode === 'list' ? (
        <select
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Select a list…</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full rounded-full border border-nativz-border bg-background px-4 py-2 text-sm text-text-primary mb-3"
          />
          <ul className="max-h-[40vh] overflow-y-auto rounded-xl border border-nativz-border divide-y divide-nativz-border">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-nativz-border accent-accent"
                />
                <p className="text-sm text-text-primary truncate">
                  {c.full_name || c.email}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || (mode === 'list' ? !listId : selected.size === 0)}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? 'Enrolling…' : 'Enroll'}
        </button>
      </div>
    </ModalShell>
  );
}
