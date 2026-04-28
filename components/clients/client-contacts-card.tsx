'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  User2,
  Mail,
  Phone,
  Plus,
  Pencil,
  Trash2,
  Star,
  Loader2,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  KeyRound,
  X,
  RotateCcw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
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

interface VaultContact {
  name: string;
  email: string;
  title?: string;
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

interface ClientContactsCardProps {
  clientId: string;
  clientName: string;
  vaultContacts?: VaultContact[];
  portalContacts?: PortalUser[];
  /** When true, drops the outer Card chrome so the caller can embed it
   *  inside an InfoCard / equivalent surface. */
  bare?: boolean;
}

const EMPTY_FORM = { name: '', email: '', phone: '', role: '', project_role: '', is_primary: false };

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function normEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

type RowState = 'cortex_user' | 'invited' | 'no_invite';

interface MergedRow {
  /** stable key for React */
  key: string;
  /** the contact record, if any */
  contact: Contact | null;
  /** the linked Cortex user, if signed up */
  portalUser: PortalUser | null;
  /** the active invite token addressed to this contact's email, if any */
  invite: InviteRow | null;
  state: RowState;
  /** display fields — sourced from contact, falling back to portalUser/invite */
  displayName: string;
  displayEmail: string;
}

export function ClientContactsCard({
  clientId,
  clientName,
  vaultContacts = [],
  portalContacts: initialPortalContacts = [],
  bare = false,
}: ClientContactsCardProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>(initialPortalContacts);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [contactsRes, invitesRes, portalRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/contacts`),
        fetch(`/api/invites?client_id=${clientId}`),
        // Portal users are also handed in as a prop on first paint, but
        // we re-fetch here so post-action state stays accurate.
        fetch(`/api/clients/${clientId}/portal-users`),
      ]);

      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setContacts(Array.isArray(data) ? data : []);
      }
      if (invitesRes.ok) {
        const data = await invitesRes.json();
        setInvites(data.invites ?? []);
      }
      if (portalRes.ok) {
        const data = await portalRes.json();
        setPortalUsers(
          (data.users ?? []).map((u: PortalUser & { is_active?: boolean }) => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            avatar_url: u.avatar_url ?? null,
            job_title: u.job_title ?? null,
            last_login: u.last_login ?? null,
          })),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

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

    // Seed with contacts
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

    // Layer on portal users (signed-up Cortex viewers)
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

    // Layer on active invites — only if the row isn't already a Cortex user
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

    // Sort: primary first, then Cortex users, then invited, then by name
    const ordered = [...byEmail.values(), ...orphanContacts].sort((a, b) => {
      const aPrimary = a.contact?.is_primary ? 1 : 0;
      const bPrimary = b.contact?.is_primary ? 1 : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      const stateRank = (s: RowState) => (s === 'cortex_user' ? 0 : s === 'invited' ? 1 : 2);
      const sd = stateRank(a.state) - stateRank(b.state);
      if (sd !== 0) return sd;
      return a.displayName.localeCompare(b.displayName);
    });

    return ordered;
  }, [contacts, portalUsers, invites]);

  function openAdd() {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      role: contact.role ?? '',
      project_role: contact.project_role ?? '',
      is_primary: contact.is_primary,
    });
    setDialogOpen(true);
  }

  async function handleSaveContact() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role.trim() || null,
      project_role: form.project_role.trim() || null,
      is_primary: form.is_primary,
    };

    try {
      if (editingContact) {
        const res = await fetch(`/api/clients/${clientId}/contacts/${editingContact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        toast.success('Contact updated');
      } else {
        const res = await fetch(`/api/clients/${clientId}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, is_primary: contacts.length === 0 || payload.is_primary }),
        });
        if (!res.ok) throw new Error();
        toast.success('Contact added');
      }
      setDialogOpen(false);
      await reload();
    } catch {
      toast.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Contact removed');
      await reload();
    } catch {
      toast.error('Failed to remove contact');
    }
  }

  async function handleSetPrimary(contactId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      if (!res.ok) throw new Error();
      toast.success('Primary contact updated');
      await reload();
    } catch {
      toast.error('Failed to update primary contact');
    }
  }

  async function handleSendInvite(row: MergedRow) {
    const email = row.displayEmail || row.contact?.email;
    if (!email) {
      toast.error('Add an email to this contact before sending an invite');
      return;
    }
    setBusyAction(`invite:${row.key}`);
    try {
      // Revoke any existing active invite to the same email so the resend
      // path doesn't leave a stale active link out in the wild.
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
      if (data.email_status === 'sent') {
        toast.success(`Invite emailed to ${email}`);
      } else if (data.email_status === 'failed') {
        toast.warning(`Invite link created — email send failed (${data.email_error ?? 'unknown'}). Copy the link and share it manually.`);
      } else {
        toast.success('Invite link created');
      }
      await reload();
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
    setBusyAction(`revoke:${row.key}`);
    try {
      const res = await fetch(`/api/invites/${row.invite.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Invite revoked');
      await reload();
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
    if (!confirm(`Remove ${row.portalUser.full_name} from this client's portal? They will lose access.`)) return;
    setBusyAction(`portal:${row.key}`);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users/${row.portalUser.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`${row.portalUser.full_name} removed from portal`);
      await reload();
    } catch {
      toast.error('Failed to remove portal access');
    } finally {
      setBusyAction(null);
    }
  }

  const hasAny =
    merged.length > 0 || vaultContacts.length > 0;

  const Wrapper = bare
    ? ({ children }: { children: React.ReactNode }) => <div>{children}</div>
    : ({ children }: { children: React.ReactNode }) => <Card>{children}</Card>;

  return (
    <>
      <Wrapper>
        <div className={`flex items-center justify-between ${bare ? 'mb-3' : 'mb-4'}`}>
          {bare ? <span /> : (
            <h2 className="text-base font-semibold text-text-primary">Contacts</h2>
          )}
          <Button variant="ghost" size="sm" onClick={openAdd}>
            <Plus size={14} />
            Add contact
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : !hasAny ? (
          <EmptyState
            icon={<User2 size={24} />}
            title="No contacts yet"
            description={`Add a contact for ${clientName} — name and email is enough. You can invite them to Cortex from the row.`}
          />
        ) : (
          <div className="space-y-2">
            {merged.map((row) => {
              const expanded = expandedKey === row.key;
              return (
                <ContactRow
                  key={row.key}
                  row={row}
                  expanded={expanded}
                  onToggleExpand={() => setExpandedKey(expanded ? null : row.key)}
                  copied={copiedKey === row.key}
                  busy={busyAction}
                  onEdit={(c) => openEdit(c)}
                  onDelete={(id) => handleDeleteContact(id)}
                  onSetPrimary={(id) => handleSetPrimary(id)}
                  onSendInvite={() => handleSendInvite(row)}
                  onCopyInvite={() => handleCopyInvite(row)}
                  onRevokeInvite={() => handleRevokeInvite(row)}
                  onResetPassword={() => handleResetPassword(row)}
                  onRemovePortalAccess={() => handleRemovePortalAccess(row)}
                />
              );
            })}

            {/* Vault contacts — read-only reference, no Cortex linkage */}
            {vaultContacts.map((c, i) => (
              <div
                key={`vault-${i}`}
                className="flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text">
                  <User2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                  {c.title && <p className="text-xs text-text-muted truncate">{c.title}</p>}
                  <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                    <Mail size={10} className="shrink-0" />
                    {c.email}
                  </p>
                </div>
                <Badge variant="default" className="text-[10px] px-1 py-0">Vault</Badge>
              </div>
            ))}
          </div>
        )}
      </Wrapper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingContact ? 'Edit contact' : 'Add contact'}>
        <div className="space-y-3">
          <Input
            id="contact_name"
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Jane Smith"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="contact_email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
            />
            <Input
              id="contact_phone"
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+1 555-1234"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="contact_role"
              label="Company role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Marketing Director"
            />
            <Input
              id="contact_project_role"
              label="Project role"
              value={form.project_role}
              onChange={(e) => setForm((f) => ({ ...f, project_role: e.target.value }))}
              placeholder="e.g. Primary Contact"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              className="accent-accent"
            />
            Primary contact
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveContact} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editingContact ? 'Save changes' : 'Add contact'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function StateBadge({ state }: { state: RowState }) {
  if (state === 'cortex_user') {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] flex items-center gap-1">
        <Check size={10} />
        Cortex user
      </Badge>
    );
  }
  if (state === 'invited') {
    return (
      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
        Invited · pending
      </Badge>
    );
  }
  return null;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface ContactRowProps {
  row: MergedRow;
  expanded: boolean;
  copied: boolean;
  busy: string | null;
  onToggleExpand: () => void;
  onEdit: (c: Contact) => void;
  onDelete: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onSendInvite: () => void;
  onCopyInvite: () => void;
  onRevokeInvite: () => void;
  onResetPassword: () => void;
  onRemovePortalAccess: () => void;
}

function ContactRow(props: ContactRowProps) {
  const {
    row,
    expanded,
    copied,
    busy,
    onToggleExpand,
    onEdit,
    onDelete,
    onSetPrimary,
    onSendInvite,
    onCopyInvite,
    onRevokeInvite,
    onResetPassword,
    onRemovePortalAccess,
  } = props;

  const { contact, portalUser, invite, state } = row;
  const canExpand = state === 'cortex_user' || state === 'invited';
  const inviteBusy = busy === `invite:${row.key}`;
  const revokeBusy = busy === `revoke:${row.key}`;
  const resetBusy = busy === `reset:${row.key}`;
  const portalBusy = busy === `portal:${row.key}`;

  return (
    <div className="rounded-lg border border-nativz-border-light bg-transparent transition-colors hover:bg-surface-hover/30">
      <div className="flex items-start gap-3 px-4 py-3">
        {portalUser?.avatar_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={portalUser.avatar_url}
            alt={portalUser.full_name}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-nativz-border mt-0.5"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text mt-0.5">
            {row.displayName ? (
              <span className="text-xs font-semibold">{getInitials(row.displayName)}</span>
            ) : (
              <User2 size={16} />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">{row.displayName || row.displayEmail}</p>
            <StateBadge state={state} />
            {contact?.is_primary && (
              <Badge variant="emerald" className="text-[10px] px-1.5 py-0">Primary</Badge>
            )}
            {contact?.project_role && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">{contact.project_role}</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            {row.displayEmail && (
              <a
                href={`mailto:${row.displayEmail}`}
                className="text-xs text-text-muted hover:text-accent-text transition-colors flex items-center gap-1 truncate"
              >
                <Mail size={10} className="shrink-0" />
                {row.displayEmail}
              </a>
            )}
            {contact?.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="text-xs text-text-muted hover:text-accent-text transition-colors flex items-center gap-1"
              >
                <Phone size={10} className="shrink-0" />
                {contact.phone}
              </a>
            )}
            {contact?.role && <span className="text-xs text-text-muted">{contact.role}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {state === 'no_invite' && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={onSendInvite}
              disabled={inviteBusy || !row.displayEmail}
              title={row.displayEmail ? 'Email a Cortex invite' : 'Add an email to enable inviting'}
            >
              {inviteBusy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send invite
            </Button>
          )}
          {state === 'invited' && (
            <>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={onSendInvite}
                disabled={inviteBusy}
                title="Resend invite email"
              >
                {inviteBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Resend
              </Button>
              <button
                type="button"
                onClick={onCopyInvite}
                disabled={!invite}
                className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer disabled:cursor-default"
                title="Copy invite link"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
              <button
                type="button"
                onClick={onRevokeInvite}
                disabled={revokeBusy}
                className="rounded-md p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Revoke invite"
              >
                {revokeBusy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              </button>
            </>
          )}
          {contact && !contact.is_primary && (
            <button
              type="button"
              onClick={() => onSetPrimary(contact.id)}
              className="rounded-md p-1.5 text-text-muted hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors cursor-pointer"
              title="Set as primary"
            >
              <Star size={14} />
            </button>
          )}
          {contact && (
            <button
              type="button"
              onClick={() => onEdit(contact)}
              className="rounded-md p-1.5 text-text-muted hover:text-accent-text hover:bg-accent-surface transition-colors cursor-pointer"
              title="Edit contact"
            >
              <Pencil size={14} />
            </button>
          )}
          {contact && (
            <button
              type="button"
              onClick={() => onDelete(contact.id)}
              className="rounded-md p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
              title="Remove contact"
            >
              <Trash2 size={14} />
            </button>
          )}
          {canExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
              title={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {expanded && (state === 'cortex_user' || state === 'invited') && (
        <div className="border-t border-nativz-border/40 px-4 py-3 space-y-4 bg-surface-hover/20">
          {state === 'cortex_user' && portalUser && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Cortex name</p>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{portalUser.full_name}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Last sign-in</p>
                  <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    {portalUser.last_login ? formatRelativeTime(portalUser.last_login) : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Job title</p>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{portalUser.job_title ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Role</p>
                  <p className="text-xs text-text-secondary mt-0.5">Portal viewer</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={onResetPassword}
                  disabled={resetBusy}
                >
                  {resetBusy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                  Reset password
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={onRemovePortalAccess}
                  disabled={portalBusy}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  {portalBusy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  Remove portal access
                </Button>
              </div>
            </>
          )}

          {state === 'invited' && invite && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Invite sent</p>
                  <p className="text-xs text-text-secondary mt-0.5">{formatDate(invite.created_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Expires</p>
                  <p className="text-xs text-text-secondary mt-0.5">{formatDate(invite.expires_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={invite.invite_url}
                  className="flex-1 rounded-md border border-nativz-border bg-surface-hover/40 px-2 py-1.5 text-xs text-text-secondary font-mono truncate"
                />
                <Button size="sm" variant="outline" type="button" onClick={onCopyInvite}>
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
