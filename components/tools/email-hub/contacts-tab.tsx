'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitMerge,
  Loader2,
  Mail,
  Plus,
  Search,
  Upload,
  UserRound,
  X,
} from 'lucide-react';

type Contact = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  role: string | null;
  client_id: string | null;
  tags: string[];
  subscribed: boolean;
  unsubscribed_at: string | null;
  created_at: string;
  client: { id: string; name: string; agency: string | null } | null;
};

type RoleFilter = 'all' | 'decision_maker' | 'contact' | 'portal_user' | 'other';
type EmailStateFilter = 'all' | 'subscribed' | 'unsubscribed';

export function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [emailFilter, setEmailFilter] = useState<EmailStateFilter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (role !== 'all') params.set('role', role);
    if (emailFilter !== 'all') params.set('email', emailFilter);

    setLoading(true);
    fetch(`/api/admin/email-hub/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.contacts) setContacts(json.contacts as Contact[]);
      })
      .catch((err) => console.warn('[contacts-tab] load failed', err))
      .finally(() => setLoading(false));
  }, [search, role, emailFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-nativz-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <UserRound size={15} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Contacts</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {contacts.length} contact{contacts.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDuplicates(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <GitMerge size={13} />
            Find duplicates
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
          >
            <Plus size={13} />
            Add contact
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <Upload size={13} />
            Import CSV
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-nativz-border bg-surface/40">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, name, or company…"
            className="w-full rounded-full border border-nativz-border bg-background px-9 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <select
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value as EmailStateFilter)}
          className="rounded-full border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary"
        >
          <option value="all">All emails</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleFilter)}
          className="rounded-full border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary"
        >
          <option value="all">All roles</option>
          <option value="decision_maker">Decision maker</option>
          <option value="contact">Contact</option>
          <option value="portal_user">Portal user</option>
          <option value="other">Other</option>
        </select>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-text-muted">Loading contacts…</div>
      ) : contacts.length === 0 ? (
        <EmptyContacts onAdd={() => setShowAdd(true)} onImport={() => setShowImport(true)} />
      ) : (
        <ContactList contacts={contacts} onRefresh={load} />
      )}

      {showAdd && (
        <AddContactModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
          busy={busy}
          setBusy={setBusy}
        />
      )}
      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            load();
          }}
        />
      )}
      {showDuplicates && <DuplicatesModal onClose={() => setShowDuplicates(false)} />}
    </section>
  );
}

function EmptyContacts({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
        <UserRound size={22} className="text-accent-text" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">No contacts yet</h3>
        <p className="mt-1 max-w-md text-sm text-text-muted">
          Add contacts manually, import from CSV, or discover them from your citations.
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={14} />
          Add contact
        </button>
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-background px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <Upload size={14} />
          Import CSV
        </button>
      </div>
    </div>
  );
}

function ContactList({ contacts, onRefresh }: { contacts: Contact[]; onRefresh: () => void }) {
  return (
    <ul className="divide-y divide-nativz-border">
      {contacts.map((c) => (
        <ContactRow key={c.id} contact={c} onChanged={onRefresh} />
      ))}
    </ul>
  );
}

function ContactRow({ contact, onChanged }: { contact: Contact; onChanged: () => void }) {
  const initials = useMemo(() => {
    const src = contact.full_name?.trim() || contact.email;
    const parts = src.split(/\s+|@/).filter(Boolean);
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  }, [contact]);

  async function toggleSub() {
    await fetch(`/api/admin/email-hub/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed: !contact.subscribed }),
    });
    onChanged();
  }

  async function remove() {
    if (!confirm(`Delete ${contact.email}? This cannot be undone.`)) return;
    await fetch(`/api/admin/email-hub/contacts/${contact.id}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <li className="px-5 py-3.5 flex items-center gap-3 hover:bg-surface/40">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface border border-nativz-border text-xs font-semibold uppercase text-accent-text">
        {initials || <Mail size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary truncate">
          {contact.full_name || contact.email}
        </p>
        <p className="text-xs text-text-muted truncate">
          {contact.full_name ? `${contact.email} · ` : ''}
          {contact.title ? `${contact.title} · ` : ''}
          {contact.company || contact.client?.name || ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {contact.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-full bg-accent-surface border border-nativz-border px-2 py-0.5 text-[10px] font-medium text-accent-text"
          >
            {t}
          </span>
        ))}
        {!contact.subscribed ? (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-500">
            Unsubscribed
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleSub}
          className="text-xs text-text-muted hover:text-text-primary"
        >
          {contact.subscribed ? 'Unsubscribe' : 'Resubscribe'}
        </button>
        <button
          type="button"
          onClick={remove}
          className="text-xs text-text-muted hover:text-rose-500"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function AddContactModal({
  onClose,
  onSaved,
  busy,
  setBusy,
}: {
  onClose: () => void;
  onSaved: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    title: '',
    company: '',
    tags: '',
  });
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/admin/email-hub/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        full_name: form.full_name || null,
        title: form.title || null,
        company: form.company || null,
        tags: form.tags
          ? form.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
          : [],
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'Failed to add contact');
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title="Add contact" onClose={onClose}>
      <div className="space-y-3">
        <LabeledInput
          label="Email"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          placeholder="name@domain.com"
          autoFocus
        />
        <LabeledInput
          label="Full name"
          value={form.full_name}
          onChange={(v) => setForm({ ...form, full_name: v })}
          placeholder="Jane Doe"
        />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Title"
            value={form.title}
            onChange={(v) => setForm({ ...form, title: v })}
            placeholder="Marketing Director"
          />
          <LabeledInput
            label="Company"
            value={form.company}
            onChange={(v) => setForm({ ...form, company: v })}
            placeholder="Acme Inc"
          />
        </div>
        <LabeledInput
          label="Tags (comma-separated)"
          value={form.tags}
          onChange={(v) => setForm({ ...form, tags: v })}
          placeholder="vip, newsletter, q2-outreach"
        />
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
          disabled={busy || !form.email}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save contact'}
        </button>
      </div>
    </ModalShell>
  );
}

function ImportCsvModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: { line: number; reason: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    const text = await file.text();
    setCsv(text);
  }

  async function submit() {
    setBusy(true);
    const res = await fetch('/api/admin/email-hub/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    const body = await res.json();
    if (!res.ok) {
      setResult({ inserted: 0, updated: 0, skipped: 0, errors: [{ line: 0, reason: body.error ?? 'failed' }] });
      return;
    }
    setResult(body);
  }

  return (
    <ModalShell title="Import contacts from CSV" onClose={onClose}>
      <p className="text-xs text-text-muted mb-3">
        Required column: <code>email</code>. Optional: <code>full_name</code>,{' '}
        <code>first_name</code>, <code>last_name</code>, <code>title</code>,{' '}
        <code>company</code>, <code>role</code>, <code>notes</code>,{' '}
        <code>tags</code> (comma or pipe separated).
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
        className="block text-xs mb-3 text-text-muted"
      />
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="email,full_name,company&#10;jane@acme.com,Jane Doe,Acme Inc"
        rows={8}
        className="w-full rounded-xl border border-nativz-border bg-background p-3 text-xs font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {result ? (
        <div className="mt-3 rounded-xl border border-nativz-border bg-surface/40 p-3 text-xs text-text-secondary">
          <p>
            Inserted <strong className="text-emerald-500">{result.inserted}</strong> · Updated{' '}
            <strong className="text-sky-500">{result.updated}</strong> · Skipped{' '}
            <strong>{result.skipped}</strong>
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-rose-500">
                  line {e.line}: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && (
          <button
            type="button"
            onClick={submit}
            disabled={busy || !csv.trim()}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Importing…
              </span>
            ) : (
              'Import'
            )}
          </button>
        )}
        {result && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90"
          >
            Done
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function DuplicatesModal({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<{ id: string; email: string; full_name: string | null }[][]>(
    [],
  );
  const [nameGroups, setNameGroups] = useState<
    { id: string; email: string; full_name: string | null }[][]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/email-hub/contacts/duplicates')
      .then((r) => r.json())
      .then((json) => {
        setGroups(json.emailDuplicates ?? []);
        setNameGroups(json.nameDuplicates ?? []);
      })
      .catch((err) => console.warn('[duplicates] load failed', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ModalShell title="Find duplicate contacts" onClose={onClose}>
      {loading ? (
        <p className="py-6 text-center text-sm text-text-muted">Scanning…</p>
      ) : groups.length === 0 && nameGroups.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No duplicate contacts found.
        </p>
      ) : (
        <div className="space-y-5 max-h-[50vh] overflow-y-auto">
          {groups.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                Email near-duplicates
              </h4>
              <ul className="space-y-3">
                {groups.map((g, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-nativz-border bg-surface/40 p-3"
                  >
                    {g.map((c) => (
                      <p key={c.id} className="text-sm text-text-primary">
                        {c.full_name ? `${c.full_name} · ` : ''}
                        {c.email}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {nameGroups.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                Same name, different email
              </h4>
              <ul className="space-y-3">
                {nameGroups.map((g, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-nativz-border bg-surface/40 p-3"
                  >
                    {g.map((c) => (
                      <p key={c.id} className="text-sm text-text-primary">
                        {c.full_name} · {c.email}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-nativz-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
    </label>
  );
}
