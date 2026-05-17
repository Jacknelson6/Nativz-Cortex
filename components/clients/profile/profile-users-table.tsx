'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Star,
  Trash2,
  User2,
  X,
} from 'lucide-react';
import { SectionCard, EditorField, editorInputClass } from './section-editor';
import { formatRelativeTime } from '@/lib/utils/format';

interface Contact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  project_role: string | null;
  is_primary: boolean;
  created_at: string;
}

interface PortalUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  last_login: string | null;
}

interface InviteRow {
  id: string;
  token: string;
  email: string | null;
  invite_url: string;
  status: 'active' | 'used' | 'expired';
  expires_at: string;
  used_at: string | null;
  used_by: { email: string; full_name: string } | null;
  created_at: string;
}

type RowState = 'cortex_user' | 'invited' | 'no_invite';

interface MergedRow {
  key: string;
  contact: Contact | null;
  portalUser: PortalUser | null;
  invite: InviteRow | null;
  state: RowState;
  displayName: string;
  displayEmail: string;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  role: '',
  project_role: '',
  is_primary: false,
};

function normEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function ProfileUsersTable({
  clientId,
  clientName,
  initialContacts,
  initialInvites,
  initialPortalUsers,
}: {
  clientId: string;
  clientName: string;
  initialContacts: Contact[];
  initialInvites: InviteRow[];
  initialPortalUsers: PortalUser[];
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>(initialPortalUsers);
  const [query, setQuery] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Server-pushed updates win on each refresh, even though we also mutate
  // local state for fast feedback on busy actions.
  useEffect(() => setContacts(initialContacts), [initialContacts]);
  useEffect(() => setInvites(initialInvites), [initialInvites]);
  useEffect(() => setPortalUsers(initialPortalUsers), [initialPortalUsers]);

  const [dialog, setDialog] = useState<
    { mode: 'add' } | { mode: 'edit'; contact: Contact } | null
  >(null);

  const merged: MergedRow[] = useMemo(() => {
    const byEmail = new Map<string, MergedRow>();
    const orphanContacts: MergedRow[] = [];

    function makeRow(seed: Partial<MergedRow> & { key: string }): MergedRow {
      return {
        contact: null,
        portalUser: null,
        invite: null,
        state: 'no_invite',
        displayName: '',
        displayEmail: '',
        ...seed,
      } as MergedRow;
    }

    for (const c of contacts) {
      const email = normEmail(c.email);
      const row = makeRow({
        key: `contact:${c.id}`,
        contact: c,
        displayName: c.name,
        displayEmail: c.email ?? '',
      });
      if (email) byEmail.set(email, row);
      else orphanContacts.push(row);
    }

    for (const u of portalUsers) {
      const email = normEmail(u.email);
      if (!email) continue;
      const existing = byEmail.get(email);
      if (existing) {
        existing.portalUser = u;
        existing.state = 'cortex_user';
      } else {
        byEmail.set(
          email,
          makeRow({
            key: `portal:${u.id}`,
            portalUser: u,
            state: 'cortex_user',
            displayName: u.full_name || u.email,
            displayEmail: u.email,
          }),
        );
      }
    }

    for (const inv of invites) {
      if (inv.status !== 'active') continue;
      const email = normEmail(inv.email);
      if (!email) continue;
      const existing = byEmail.get(email);
      if (existing) {
        if (existing.state !== 'cortex_user') {
          existing.invite = inv;
          existing.state = 'invited';
        }
      } else {
        byEmail.set(
          email,
          makeRow({
            key: `invite:${inv.id}`,
            invite: inv,
            state: 'invited',
            displayName: email,
            displayEmail: email,
          }),
        );
      }
    }

    return [...byEmail.values(), ...orphanContacts].sort((a, b) => {
      const aPrimary = a.contact?.is_primary ? 1 : 0;
      const bPrimary = b.contact?.is_primary ? 1 : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      const stateRank = (s: RowState) => (s === 'cortex_user' ? 0 : s === 'invited' ? 1 : 2);
      const sd = stateRank(a.state) - stateRank(b.state);
      if (sd !== 0) return sd;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [contacts, portalUsers, invites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((r) => {
      return (
        r.displayName.toLowerCase().includes(q) ||
        r.displayEmail.toLowerCase().includes(q) ||
        (r.contact?.role ?? '').toLowerCase().includes(q) ||
        (r.contact?.project_role ?? '').toLowerCase().includes(q)
      );
    });
  }, [merged, query]);

  async function handleSendInvite(row: MergedRow) {
    const email = row.displayEmail || row.contact?.email;
    if (!email) {
      toast.error('Add an email to this contact before sending an invite');
      return;
    }
    setBusyAction(`invite:${row.key}`);
    try {
      const stale = invites.find(
        (i) => i.status === 'active' && normEmail(i.email) === normEmail(email),
      );
      if (stale) {
        await fetch(`/api/invites/${stale.id}`, { method: 'DELETE' }).catch(() => null);
      }
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          email,
          contact_name: row.contact?.name ?? row.displayName ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to send invite');
        return;
      }
      if (data.email_status === 'sent') toast.success(`Invite emailed to ${email}`);
      else if (data.email_status === 'failed') {
        toast.warning(`Invite link created. Email send failed (${data.email_error ?? 'unknown'}). Copy the link and share manually.`);
      } else toast.success('Invite link created');
      router.refresh();
    } catch {
      toast.error('Failed to send invite');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCopyInvite(row: MergedRow) {
    if (!row.invite?.invite_url) return;
    await navigator.clipboard.writeText(row.invite.invite_url);
    setCopiedKey(row.key);
    toast.success('Invite link copied');
    setTimeout(() => setCopiedKey((k) => (k === row.key ? null : k)), 2000);
  }

  async function handleRevokeInvite(row: MergedRow) {
    if (!row.invite) return;
    if (!confirm('Revoke this invite? The link stops working immediately.')) return;
    setBusyAction(`revoke:${row.key}`);
    try {
      const res = await fetch(`/api/invites/${row.invite.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Invite revoked');
      router.refresh();
    } catch {
      toast.error('Failed to revoke invite');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResetPassword(row: MergedRow) {
    if (!row.portalUser) return;
    setBusyAction(`reset:${row.key}`);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: row.portalUser.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      if (data.reset_link) {
        await navigator.clipboard.writeText(data.reset_link).catch(() => null);
        toast.success('Reset link copied to clipboard');
      } else {
        toast.success('Reset email sent');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemovePortalAccess(row: MergedRow) {
    if (!row.portalUser) return;
    if (!confirm(`Remove ${row.portalUser.full_name}'s portal access for this client?`)) return;
    setBusyAction(`portal:${row.key}`);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users/${row.portalUser.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success('Portal access removed');
      router.refresh();
    } catch {
      toast.error('Failed to remove portal access');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetPrimary(row: MergedRow) {
    if (!row.contact) return;
    setBusyAction(`primary:${row.key}`);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${row.contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      if (!res.ok) throw new Error();
      toast.success('Primary contact updated');
      router.refresh();
    } catch {
      toast.error('Failed to update primary contact');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteContact(row: MergedRow) {
    if (!row.contact) return;
    if (!confirm(`Remove ${row.contact.name}? This can't be undone.`)) return;
    setBusyAction(`delete:${row.key}`);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${row.contact.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success('Contact removed');
      router.refresh();
    } catch {
      toast.error('Failed to remove contact');
    } finally {
      setBusyAction(null);
    }
  }

  const headerAction = (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="w-44 rounded-lg border border-nativz-border/80 bg-background/60 pl-7 pr-2.5 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <button
        type="button"
        onClick={() => setDialog({ mode: 'add' })}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
      >
        <Plus size={12} />
        Invite
      </button>
    </div>
  );

  return (
    <>
      <SectionCard
        title="People"
        description={`Everyone we talk to about ${clientName}, plus anyone with portal access. Send, resend, or revoke invites from the row menu.`}
        headerAction={headerAction}
        bodyClassName="px-0 py-0"
      >
        {filtered.length === 0 ? (
          <div className="px-5 sm:px-6 py-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface text-accent-text mb-3">
              <User2 size={18} />
            </div>
            <p className="text-[13px] font-medium text-text-primary">
              {query ? 'No matches' : 'No people yet'}
            </p>
            <p className="mt-1 text-[12px] text-text-muted">
              {query
                ? 'Try a different name or email.'
                : `Invite ${clientName} to the portal or add a contact for approvals + project questions.`}
            </p>
          </div>
        ) : (
          <div>
            <div className="hidden sm:grid grid-cols-[1.4fr_1fr_0.9fr_2.5rem] gap-4 px-5 sm:px-6 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-muted border-b border-nativz-border/50 bg-background/30">
              <div>Name</div>
              <div>Email</div>
              <div>Last active</div>
              <div className="sr-only">Actions</div>
            </div>
            <ul className="divide-y divide-nativz-border/50">
              {filtered.map((row) => (
                <UserRow
                  key={row.key}
                  row={row}
                  busy={busyAction}
                  copied={copiedKey === row.key}
                  onEdit={() => row.contact && setDialog({ mode: 'edit', contact: row.contact })}
                  onDelete={() => handleDeleteContact(row)}
                  onSetPrimary={() => handleSetPrimary(row)}
                  onSendInvite={() => handleSendInvite(row)}
                  onCopyInvite={() => handleCopyInvite(row)}
                  onRevokeInvite={() => handleRevokeInvite(row)}
                  onResetPassword={() => handleResetPassword(row)}
                  onRemovePortalAccess={() => handleRemovePortalAccess(row)}
                />
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {dialog && (
        <ContactDialog
          mode={dialog.mode}
          contact={dialog.mode === 'edit' ? dialog.contact : null}
          clientId={clientId}
          isFirstContact={contacts.length === 0}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function UserRow({
  row,
  busy,
  copied,
  onEdit,
  onDelete,
  onSetPrimary,
  onSendInvite,
  onCopyInvite,
  onRevokeInvite,
  onResetPassword,
  onRemovePortalAccess,
}: {
  row: MergedRow;
  busy: string | null;
  copied: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  onSendInvite: () => void;
  onCopyInvite: () => void;
  onRevokeInvite: () => void;
  onResetPassword: () => void;
  onRemovePortalAccess: () => void;
}) {
  const { contact, portalUser, state } = row;
  const inviteBusy = busy === `invite:${row.key}`;
  const anyBusy = busy?.endsWith(`:${row.key}`) ?? false;

  const stateMeta: Record<RowState, { dot: string; label: string }> = {
    cortex_user: { dot: 'bg-emerald-400', label: 'Portal access' },
    invited: { dot: 'bg-amber-400', label: 'Invite pending' },
    no_invite: { dot: 'bg-text-muted/40', label: 'No portal access' },
  };
  const meta = stateMeta[state];

  const lastActive =
    portalUser?.last_login
      ? formatRelativeTime(portalUser.last_login)
      : state === 'invited'
        ? 'Invite sent'
        : 'Never';

  const menuItems = useMemo(() => {
    const items: { label: string; onClick: () => void; destructive?: boolean }[] = [];
    if (state === 'no_invite') {
      items.push({ label: 'Send invite', onClick: onSendInvite });
    }
    if (state === 'invited') {
      items.push({ label: 'Resend invite', onClick: onSendInvite });
      items.push({ label: copied ? 'Link copied' : 'Copy invite link', onClick: onCopyInvite });
      items.push({ label: 'Revoke invite', onClick: onRevokeInvite, destructive: true });
    }
    if (state === 'cortex_user') {
      items.push({ label: 'Send reset link', onClick: onResetPassword });
      items.push({ label: 'Remove portal access', onClick: onRemovePortalAccess, destructive: true });
    }
    if (contact) {
      items.push({ label: 'Edit contact', onClick: onEdit });
      if (!contact.is_primary) {
        items.push({ label: 'Set as primary', onClick: onSetPrimary });
      }
      items.push({ label: 'Remove contact', onClick: onDelete, destructive: true });
    }
    return items;
  }, [
    state,
    contact,
    copied,
    onSendInvite,
    onCopyInvite,
    onRevokeInvite,
    onResetPassword,
    onRemovePortalAccess,
    onEdit,
    onSetPrimary,
    onDelete,
  ]);

  return (
    <li className="grid grid-cols-[1fr_2.5rem] sm:grid-cols-[1.4fr_1fr_0.9fr_2.5rem] items-center gap-4 px-5 sm:px-6 py-3.5 hover:bg-surface-hover/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {portalUser?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portalUser.avatar_url}
            alt={portalUser.full_name}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-nativz-border"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-[12px] font-semibold text-accent-text">
            {getInitials(row.displayName || row.displayEmail || '?')}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[13px] font-medium text-text-primary truncate">
              {row.displayName || row.displayEmail || 'Unnamed'}
            </p>
            {contact?.is_primary && (
              <span title="Primary contact" className="text-amber-300 shrink-0">
                <Star size={11} className="fill-current" />
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            <span className="truncate">{meta.label}</span>
            {contact?.project_role && (
              <>
                <span className="text-nativz-border">·</span>
                <span className="truncate">{contact.project_role}</span>
              </>
            )}
          </div>
          {/* Mobile: collapse email + last active into the same column */}
          <div className="sm:hidden mt-1.5 space-y-0.5 text-[11.5px] text-text-muted">
            {row.displayEmail && <p className="truncate">{row.displayEmail}</p>}
            <p>Last active: {lastActive}</p>
          </div>
        </div>
      </div>

      <div className="hidden sm:block min-w-0 text-[12.5px] text-text-secondary truncate">
        {row.displayEmail || <span className="text-text-muted/60">No email</span>}
      </div>

      <div className="hidden sm:block text-[12px] text-text-muted truncate">{lastActive}</div>

      <div className="flex items-center justify-end">
        {anyBusy ? (
          <Loader2 size={14} className="animate-spin text-text-muted" />
        ) : (
          <RowMenu items={menuItems} />
        )}
      </div>

      {/* Inline 'Send invite' surface still wanted on no-email rows so the
          user gets a hint why the menu's primary action is disabled — but
          for now the menu carries it, no extra inline button. inviteBusy
          spinner is covered by the anyBusy check above. */}
      {inviteBusy && null}
    </li>
  );
}

function RowMenu({
  items,
}: {
  items: { label: string; onClick: () => void; destructive?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        aria-label="Open actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-nativz-border bg-surface text-[12.5px] shadow-xl"
        >
          {items.map((item, i) => (
            <button
              key={`${item.label}-${i}`}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-2 text-left transition-colors hover:bg-surface-hover ${
                item.destructive
                  ? 'text-rose-300 hover:text-rose-200'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactDialog({
  mode,
  contact,
  clientId,
  isFirstContact,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit';
  contact: Contact | null;
  clientId: string;
  isFirstContact: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() =>
    contact
      ? {
          name: contact.name,
          email: contact.email ?? '',
          phone: contact.phone ?? '',
          role: contact.role ?? '',
          project_role: contact.project_role ?? '',
          is_primary: contact.is_primary,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function setPartial(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role.trim() || null,
      project_role: form.project_role.trim() || null,
      is_primary: mode === 'add' ? isFirstContact || form.is_primary : form.is_primary,
    };
    try {
      const url =
        mode === 'edit'
          ? `/api/clients/${clientId}/contacts/${contact!.id}`
          : `/api/clients/${clientId}/contacts`;
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      toast.success(mode === 'edit' ? 'Contact updated' : 'Contact added');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-nativz-border bg-surface p-0 text-text-primary backdrop:bg-black/60"
    >
      <header className="flex items-start justify-between gap-3 border-b border-nativz-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-text-primary">
            {mode === 'edit' ? 'Edit contact' : 'Add contact'}
          </h3>
          <p className="text-[12px] text-text-muted mt-1 leading-relaxed">
            Name + email is enough. You can invite them to the portal from the row menu.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>
      <div className="px-5 py-4 space-y-4">
        <EditorField label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setPartial({ name: e.target.value })}
            className={editorInputClass}
            placeholder="Jane Smith"
            autoFocus
          />
        </EditorField>
        <EditorField label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setPartial({ email: e.target.value })}
            className={editorInputClass}
            placeholder="jane@company.com"
          />
        </EditorField>
        <EditorField label="Phone">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setPartial({ phone: e.target.value })}
            className={editorInputClass}
            placeholder="+1 555 123 4567"
          />
        </EditorField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EditorField label="Title" hint="Their job title.">
            <input
              type="text"
              value={form.role}
              onChange={(e) => setPartial({ role: e.target.value })}
              className={editorInputClass}
              placeholder="CMO"
            />
          </EditorField>
          <EditorField label="Project role" hint="What they own on our side.">
            <input
              type="text"
              value={form.project_role}
              onChange={(e) => setPartial({ project_role: e.target.value })}
              className={editorInputClass}
              placeholder="Approvals"
            />
          </EditorField>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => setPartial({ is_primary: e.target.checked })}
            className="h-4 w-4 rounded border-nativz-border bg-background accent-accent"
          />
          Primary point of contact
        </label>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-nativz-border bg-background/40 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-full px-3 py-1.5 text-[12px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {mode === 'edit' ? 'Save changes' : 'Add contact'}
        </button>
      </footer>
    </dialog>
  );
}
