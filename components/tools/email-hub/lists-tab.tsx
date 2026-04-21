'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, FolderPlus, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { LabeledInput, ModalShell } from './contacts-tab';

type EmailList = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  member_count: number;
  created_at: string;
  updated_at: string;
};

type Member = {
  added_at: string;
  contact: {
    id: string;
    email: string;
    full_name: string | null;
    title: string | null;
    company: string | null;
    subscribed: boolean;
  } | null;
};

type Contact = {
  id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  company: string | null;
};

export function ListsTab() {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/email-hub/lists');
    const json = await res.json();
    setLists((json.lists ?? []) as EmailList[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (selectedId) {
    return (
      <ListDetailView
        listId={selectedId}
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
            <FolderPlus size={15} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Lists</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {lists.length} list{lists.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={13} />
          New list
        </button>
      </header>

      {loading ? (
        <div className="p-12 text-center text-sm text-text-muted">Loading lists…</div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
            <FolderPlus size={22} className="text-accent-text" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">No lists yet</h3>
            <p className="mt-1 max-w-md text-sm text-text-muted">
              Group contacts into reusable audiences you can target from a campaign or
              enroll into a sequence.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
          >
            <Plus size={14} />
            New list
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {lists.map((l) => (
            <li
              key={l.id}
              className="px-5 py-3.5 flex items-center gap-3 hover:bg-surface/40 cursor-pointer"
              onClick={() => setSelectedId(l.id)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface border border-nativz-border text-accent-text">
                <FolderPlus size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{l.name}</p>
                {l.description ? (
                  <p className="text-xs text-text-muted truncate mt-0.5">{l.description}</p>
                ) : null}
              </div>
              <div className="text-xs text-text-muted tabular-nums shrink-0">
                {l.member_count} member{l.member_count === 1 ? '' : 's'}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function CreateListModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/email-hub/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'Failed to create list');
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title="New list" onClose={onClose}>
      <div className="space-y-3">
        <LabeledInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Q2 client audit recipients"
          autoFocus
        />
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Description (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-nativz-border bg-background p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
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
          disabled={busy || !name.trim()}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create list'}
        </button>
      </div>
    </ModalShell>
  );
}

function ListDetailView({ listId, onBack }: { listId: string; onBack: () => void }) {
  const [list, setList] = useState<EmailList | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/email-hub/lists/${listId}`);
    const json = await res.json();
    setList(json.list as EmailList);
    setMembers((json.members ?? []) as Member[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [listId]);

  async function remove(contactId: string) {
    await fetch(`/api/admin/email-hub/lists/${listId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_ids: [contactId] }),
    });
    load();
  }

  async function deleteList() {
    if (!confirm('Delete this list? Contacts are kept, only the grouping is removed.')) return;
    await fetch(`/api/admin/email-hub/lists/${listId}`, { method: 'DELETE' });
    onBack();
  }

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
              {list?.name ?? 'List'}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {members.length} member{members.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
          >
            <UserPlus size={13} />
            Add contacts
          </button>
          <button
            type="button"
            onClick={deleteList}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/20"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-12 text-center text-sm text-text-muted">Loading members…</div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <p className="text-sm text-text-muted">No members yet.</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
          >
            <UserPlus size={14} />
            Add contacts
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {members.map((m) =>
            m.contact ? (
              <li key={m.contact.id} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {m.contact.full_name || m.contact.email}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {m.contact.full_name ? `${m.contact.email} · ` : ''}
                    {[m.contact.title, m.contact.company].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!m.contact.subscribed && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                    Unsubscribed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(m.contact!.id)}
                  className="text-xs text-text-muted hover:text-rose-500 inline-flex items-center gap-1"
                >
                  <UserMinus size={12} />
                  Remove
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}

      {showAdd && (
        <AddContactsModal
          listId={listId}
          existingIds={members.map((m) => m.contact?.id).filter(Boolean) as string[]}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function AddContactsModal({
  listId,
  existingIds,
  onClose,
  onAdded,
}: {
  listId: string;
  existingIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const existingSet = new Set(existingIds);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    params.set('limit', '200');
    fetch(`/api/admin/email-hub/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setContacts((j.contacts ?? []) as Contact[]))
      .catch(() => {});
  }, [search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setBusy(true);
    await fetch(`/api/admin/email-hub/lists/${listId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_ids: Array.from(selected) }),
    });
    setBusy(false);
    onAdded();
  }

  return (
    <ModalShell title="Add contacts to list" onClose={onClose}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts…"
        className="w-full rounded-full border border-nativz-border bg-background px-4 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 mb-3"
        autoFocus
      />
      <ul className="max-h-[45vh] overflow-y-auto rounded-xl border border-nativz-border divide-y divide-nativz-border">
        {contacts.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-text-muted">No contacts.</li>
        ) : (
          contacts.map((c) => {
            const already = existingSet.has(c.id);
            const checked = selected.has(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={already}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 rounded border-nativz-border accent-accent"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">
                    {c.full_name || c.email}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {c.full_name ? `${c.email} · ` : ''}
                    {[c.title, c.company].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {already && (
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    Already added
                  </span>
                )}
              </li>
            );
          })
        )}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          {selected.size} selected
        </p>
        <div className="flex items-center gap-2">
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
            disabled={busy || selected.size === 0}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            Add {selected.size > 0 ? selected.size : ''}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
