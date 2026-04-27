'use client';

import { useState, useEffect } from 'react';
import {
  UserPlus, Building2, Shield, Loader2, Copy, Check, Send, Minus, Plus, Mail,
  ClipboardList, Upload, X, AlertTriangle, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav';
import { ClientPickerButton, type ClientOption as PickerClientOption } from '@/components/ui/client-picker';
import { parseContactList, type ParsedContact } from '@/lib/invites/parse-contacts';

interface GeneratedInvite {
  invite_url: string;
  expires_at: string;
  label?: string;
}

interface InviteUsersDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after any invite(s) were successfully created, so the parent can refresh. */
  onInvited?: () => void;
  /**
   * Per-client trigger mode: lock the dialog to portal-invites for this
   * specific client. Hides the Portal/Admin tab switcher and the client
   * picker. Used by the onboard-review "Invite to portal" card so both
   * entry points share a single form.
   */
  lockedClient?: { id: string; name: string } | null;
}

type Tab = 'portal' | 'admin';

const SCOPE_TABS: SubNavItem<Tab>[] = [
  { slug: 'portal', label: 'Portal user', icon: <Building2 size={13} /> },
  { slug: 'admin', label: 'Admin / team', icon: <Shield size={13} /> },
];

export function InviteUsersDialog({ open, onClose, onInvited, lockedClient = null }: InviteUsersDialogProps) {
  const [tab, setTab] = useState<Tab>('portal');
  const [generated, setGenerated] = useState<GeneratedInvite[]>([]);
  const [generatedHeading, setGeneratedHeading] = useState<string>('');

  function handleClose() {
    // Reset state on close so reopening is clean
    setTab('portal');
    setGenerated([]);
    setGeneratedHeading('');
    onClose();
  }

  function handleInvitesCreated(heading: string, invites: GeneratedInvite[]) {
    setGenerated(invites);
    setGeneratedHeading(heading);
    onInvited?.();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={lockedClient ? `Invite to ${lockedClient.name}` : 'Invite users'}
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Per-client trigger mode: hide the tab switcher; we only ever invite
            portal users for that one client. */}
        {!lockedClient && (
          <SubNav
            items={SCOPE_TABS}
            active={tab}
            onChange={(slug) => { setTab(slug); setGenerated([]); }}
            ariaLabel="Invite scope"
          />
        )}

        {tab === 'portal' || lockedClient ? (
          <PortalInviteForm onInvitesCreated={handleInvitesCreated} lockedClient={lockedClient} />
        ) : (
          <AdminInviteForm onInvitesCreated={handleInvitesCreated} />
        )}

        {generated.length > 0 && (
          <GeneratedInvitesPanel heading={generatedHeading} invites={generated} />
        )}
      </div>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Portal invite form
 * ─────────────────────────────────────────────────────────────── */

type PortalMode = 'single' | 'bulk';

const MODE_TABS: SubNavItem<PortalMode>[] = [
  { slug: 'single', label: 'One at a time', icon: <Mail size={13} /> },
  { slug: 'bulk', label: 'Paste / upload list', icon: <ClipboardList size={13} /> },
];

function PortalInviteForm({
  onInvitesCreated,
  lockedClient = null,
}: {
  onInvitesCreated: (heading: string, invites: GeneratedInvite[]) => void;
  lockedClient?: { id: string; name: string } | null;
}) {
  const [clients, setClients] = useState<PickerClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(!lockedClient);
  const [clientId, setClientId] = useState<string | null>(lockedClient?.id ?? null);
  const [mode, setMode] = useState<PortalMode>('single');
  const [count, setCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');

  useEffect(() => {
    // Locked-client mode skips the client list fetch — the parent already
    // knows which client we're inviting to.
    if (lockedClient) return;
    (async () => {
      try {
        const res = await fetch('/api/clients');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.clients ?? []);
          setClients(list.map((c: { id: string; name: string; logo_url?: string | null; agency?: string | null }) => ({
            id: c.id,
            name: c.name,
            logo_url: c.logo_url ?? null,
            agency: c.agency ?? null,
          })));
        }
      } finally {
        setLoadingClients(false);
      }
    })();
  }, [lockedClient]);

  function clampCount(n: number) {
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(50, Math.floor(n)));
  }

  async function handleGenerate() {
    if (!clientId) {
      toast.error('Select a client');
      return;
    }
    const desired = clampCount(count);
    const trimmedEmail = email.trim();
    const trimmedName = contactName.trim();

    // When an email is provided, route through the single-invite endpoint so
    // we send the branded invite email. Multi-invite batches stay link-only —
    // sending N emails to the same address is rarely what the user wants, and
    // if it is, they can just generate a second single invite.
    if (trimmedEmail && desired > 1) {
      toast.error('Emailed invites are one at a time. Set quantity to 1 or clear the email.');
      return;
    }

    setSubmitting(true);
    try {
      if (trimmedEmail) {
        const res = await fetch('/api/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            email: trimmedEmail,
            contact_name: trimmedName || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? 'Failed to create invite');
          return;
        }
        onInvitesCreated(`Invite for ${data.client_name}`, [
          { invite_url: data.invite_url, expires_at: data.expires_at },
        ]);
        if (data.email_status === 'sent') {
          toast.success(`Invite emailed to ${trimmedEmail}`);
          setEmail('');
          setContactName('');
        } else if (data.email_status === 'failed') {
          toast.error(`Could not send email: ${data.email_error ?? 'unknown error'}`);
        } else {
          toast.success('Invite generated');
        }
        return;
      }

      const res = await fetch('/api/invites/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, count: desired }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to create invites');
        return;
      }
      const invites: GeneratedInvite[] = (data.invites ?? []).map((inv: GeneratedInvite, i: number) => ({
        invite_url: inv.invite_url,
        expires_at: inv.expires_at,
        label: desired > 1 ? `Invite ${i + 1}` : undefined,
      }));
      onInvitesCreated(
        desired === 1
          ? `Invite for ${data.client_name}`
          : `${desired} invites for ${data.client_name}`,
        invites
      );
      toast.success(desired === 1 ? 'Invite generated' : `${desired} invites generated`);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Client picker — hidden when locked to a specific client (onboard flow). */}
      {!lockedClient && (
        <div>
          <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
            Client
          </label>
          {loadingClients ? (
            <div className="h-11 rounded-xl bg-surface-hover animate-pulse" />
          ) : (
            <ClientPickerButton
              clients={clients}
              value={clientId}
              onChange={setClientId}
              placeholder="Select a client"
            />
          )}
        </div>
      )}

      {/* Mode switcher — single vs paste/upload list */}
      <SubNav
        items={MODE_TABS}
        active={mode}
        onChange={setMode}
        ariaLabel="Invite input mode"
      />

      {/* Email preview — always available so admins can see exactly what
          the recipient gets (agency branding auto-picked from client). */}
      <EmailPreviewPanel clientId={clientId} previewName={contactName.trim() || undefined} />

      {mode === 'bulk' ? (
        <BulkEmailInviteForm
          clientId={clientId}
          onInvitesCreated={onInvitesCreated}
        />
      ) : (
      <>
      {/* Email (optional) — when set, sends the branded invite email.
          When empty, the flow falls back to link-only batch generation. */}
      <div className="rounded-xl border border-nativz-border/70 bg-surface-hover/30 p-3 space-y-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-text-secondary">
          <Mail size={12} className="text-accent-text" />
          Email the invite (optional — leave blank for link-only)
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact name"
            className="rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
            disabled={submitting}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
            disabled={submitting}
          />
        </div>
        <p className="text-[11px] text-text-muted/75">
          Agency theming (Nativz or Anderson Collaborative) is auto-resolved from the client.
        </p>
      </div>

      {/* Number of invites — always visible, default 1, +/- or type */}
      <div>
        <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Number of invites
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCount((n) => clampCount(n - 1))}
            disabled={count <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Decrease"
          >
            <Minus size={14} />
          </button>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(clampCount(parseInt(e.target.value, 10)))}
            className="w-20 text-center rounded-lg border border-nativz-border bg-transparent px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
          />
          <button
            type="button"
            onClick={() => setCount((n) => clampCount(n + 1))}
            disabled={count >= 50}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Increase"
          >
            <Plus size={14} />
          </button>
          <span className="text-[11px] text-text-muted ml-1">
            Each one is a unique, one-time link (7-day expiry).
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleGenerate} disabled={submitting || !clientId}>
          {submitting ? (
            <><Loader2 size={13} className="animate-spin" /> {email.trim() ? 'Sending…' : 'Generating…'}</>
          ) : email.trim() ? (
            <><Mail size={13} /> Send invite</>
          ) : (
            <><UserPlus size={13} /> Generate {count > 1 ? `${count} invites` : 'invite'}</>
          )}
        </Button>
      </div>
      </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Bulk-email (paste/upload) invite form
 * ─────────────────────────────────────────────────────────────── */

function BulkEmailInviteForm({
  clientId,
  onInvitesCreated,
}: {
  clientId: string | null;
  onInvitesCreated: (heading: string, invites: GeneratedInvite[]) => void;
}) {
  const [rawInput, setRawInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removedEmails, setRemovedEmails] = useState<Set<string>>(new Set());

  const parsed = rawInput.trim() ? parseContactList(rawInput) : null;
  const liveContacts: ParsedContact[] = (parsed?.contacts ?? []).filter(
    (c) => !removedEmails.has(c.email),
  );
  const totalParsed = parsed?.contacts.length ?? 0;
  const hasErrors = (parsed?.errors.length ?? 0) > 0;
  const hasDuplicates = (parsed?.duplicates.length ?? 0) > 0;

  function handleFile(file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setRawInput((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
      }
    };
    reader.onerror = () => toast.error(`Could not read ${file.name}`);
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(csv|tsv|txt)$/i.test(file.name)) {
      e.preventDefault();
      handleFile(file);
    }
  }

  function removeContact(email: string) {
    setRemovedEmails((prev) => {
      const next = new Set(prev);
      next.add(email);
      return next;
    });
  }

  async function handleSend() {
    if (!clientId) { toast.error('Select a client'); return; }
    if (liveContacts.length === 0) { toast.error('Paste at least one email'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/invites/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          contacts: liveContacts.map((c) => ({ email: c.email, name: c.name })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to send invites');
        return;
      }

      const sent = (data.results as Array<{ status: string; invite_url?: string; email: string }>).filter(
        (r) => r.status === 'sent',
      );
      const invites: GeneratedInvite[] = sent
        .map((r) => ({
          invite_url: r.invite_url ?? '',
          expires_at: '',
          label: r.email,
        }))
        .filter((inv) => inv.invite_url);

      onInvitesCreated(
        data.sent === 1
          ? `1 invite sent for ${data.client_name}`
          : `${data.sent} invites sent for ${data.client_name}${data.failed ? ` (${data.failed} failed)` : ''}`,
        invites,
      );

      if (data.failed > 0) {
        toast.warning(`${data.sent} sent, ${data.failed} failed — see list below`);
      } else {
        toast.success(`${data.sent} invite${data.sent === 1 ? '' : 's'} emailed`);
        setRawInput('');
        setRemovedEmails(new Set());
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Paste emails or drop a CSV
        </label>
        <textarea
          value={rawInput}
          onChange={(e) => { setRawInput(e.target.value); setRemovedEmails(new Set()); }}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          rows={6}
          placeholder={'jane@company.com\nJohn Smith <john@company.com>\nname,email\nSam Lee,sam@company.com'}
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
          disabled={submitting}
        />
        <div className="flex items-center justify-between mt-1.5">
          <label className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary cursor-pointer">
            <Upload size={11} />
            Upload .csv
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <span className="text-[11px] text-text-muted/70">
            Name + email, any column order. Headers optional.
          </span>
        </div>
      </div>

      {/* Preview */}
      {parsed && (liveContacts.length > 0 || hasErrors) && (
        <div className="rounded-xl border border-nativz-border bg-surface-hover/20 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-nativz-border/60">
            <span className="text-[11px] font-medium text-text-secondary">
              {liveContacts.length} ready
              {totalParsed !== liveContacts.length && ` · ${totalParsed - liveContacts.length} removed`}
              {hasDuplicates && ` · ${parsed.duplicates.length} dup`}
              {hasErrors && ` · ${parsed.errors.length} skipped`}
            </span>
            {liveContacts.length > 0 && (
              <span className="text-[11px] text-text-muted">Agency theming auto-resolved from client.</span>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-nativz-border/50">
            {liveContacts.map((c) => (
              <div key={c.email} className="group flex items-center gap-2 px-3 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary truncate">
                    {c.name ? <span>{c.name} <span className="text-text-muted">&middot; {c.email}</span></span> : c.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(c.email)}
                  className="shrink-0 rounded-md p-1 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Remove ${c.email}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {parsed.errors.map((e) => (
              <div key={`err-${e.line}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                <span className="text-text-muted truncate">
                  <span className="text-amber-400/80">Line {e.line}:</span> {e.source || '(blank)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleSend}
          disabled={submitting || !clientId || liveContacts.length === 0}
        >
          {submitting ? (
            <><Loader2 size={13} className="animate-spin" /> Sending…</>
          ) : (
            <><Send size={13} /> Send {liveContacts.length || ''} branded invite{liveContacts.length === 1 ? '' : 's'}</>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Email preview panel
 * ─────────────────────────────────────────────────────────────── */

function EmailPreviewPanel({
  clientId,
  previewName,
}: {
  clientId: string | null;
  previewName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || !clientId) return;
    let cancelled = false;
    async function loadPreview() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ client_id: clientId! });
        if (previewName) params.set('name', previewName);
        const res = await fetch(`/api/invites/preview?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? 'Preview failed');
        }
        const body = await res.text();
        if (!cancelled) setHtml(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPreview();
    return () => { cancelled = true; };
  }, [expanded, clientId, previewName]);

  if (!clientId) return null;

  return (
    <div className="rounded-xl border border-nativz-border/70 bg-surface-hover/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover/40 transition-colors cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5">
          <Eye size={12} className="text-accent-text" />
          {expanded ? 'Hide email preview' : 'Preview email'}
        </span>
        <span className="text-[11px] text-text-muted/70">
          Agency branding auto-resolved
        </span>
      </button>
      {expanded && (
        <div className="border-t border-nativz-border/60 bg-white">
          {loading && (
            <div className="flex items-center justify-center py-10 bg-surface-hover/30">
              <Loader2 size={16} className="animate-spin text-text-muted" />
            </div>
          )}
          {error && !loading && (
            <div className="px-3 py-4 text-xs text-amber-400 bg-surface-hover/40">
              {error}
            </div>
          )}
          {html && !loading && !error && (
            <iframe
              title="Invite email preview"
              srcDoc={html}
              sandbox=""
              className="block w-full h-[420px] border-0 bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Admin / team invite form
 * ─────────────────────────────────────────────────────────────── */

function AdminInviteForm({
  onInvitesCreated,
}: {
  onInvitesCreated: (heading: string, invites: GeneratedInvite[]) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSendInvite() {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) { toast.error('Name is required'); return; }
    if (!trimmedEmail || !trimmedEmail.includes('@')) { toast.error('Valid email required'); return; }

    setSubmitting(true);
    try {
      // 1. Create team_member
      const createRes = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: trimmedName,
          email: trimmedEmail,
          role: role.trim() || null,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        toast.error(created.error ?? 'Failed to create team member');
        return;
      }

      // 2. Generate the invite token for that member
      const inviteRes = await fetch(`/api/team/${created.id}/invite`, { method: 'POST' });
      const inviteData = await inviteRes.json();
      if (!inviteRes.ok) {
        toast.error(inviteData.error ?? 'Team member created, but failed to generate invite');
        return;
      }

      onInvitesCreated(`Invite for ${trimmedName}`, [{
        invite_url: inviteData.invite_url,
        expires_at: inviteData.expires_at,
      }]);
      toast.success(`Invite sent to ${trimmedEmail}`);

      setFullName('');
      setEmail('');
      setRole('');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Full name
        </label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Doe"
          className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@nativz.io"
          className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
        />
        <p className="text-[11px] text-text-muted/70 mt-1">
          The invite email will be sent here, and it becomes their login.
        </p>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Role (optional)
        </label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Content manager, Videographer, Strategist…"
          className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSendInvite} disabled={submitting}>
          {submitting ? (
            <><Loader2 size={13} className="animate-spin" /> Sending…</>
          ) : (
            <><Send size={13} /> Send invite</>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Generated invites panel (shared by both tabs)
 * ─────────────────────────────────────────────────────────────── */

function GeneratedInvitesPanel({
  heading,
  invites,
}: {
  heading: string;
  invites: GeneratedInvite[];
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  function handleCopy(url: string, index: number) {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setCopiedAll(false);
    toast.success('Copied');
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function handleCopyAll() {
    const text = invites.map((i, idx) => `${i.label ?? `Invite ${idx + 1}`}: ${i.invite_url}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setCopiedIndex(null);
    toast.success('All invites copied');
    setTimeout(() => setCopiedAll(false), 2000);
  }

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <Check size={12} />
          {heading}
        </div>
        {invites.length > 1 && (
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary cursor-pointer"
          >
            {copiedAll ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            Copy all
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {invites.map((inv, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {inv.label && (
              <span className="text-[11px] text-text-muted w-16 shrink-0">{inv.label}</span>
            )}
            <input
              readOnly
              value={inv.invite_url}
              className="flex-1 rounded-md border border-nativz-border/50 bg-surface-hover/50 px-2 py-1 text-xs text-text-primary font-mono truncate"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => handleCopy(inv.invite_url, idx)}
              className="shrink-0 rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {copiedIndex === idx ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted/70">
        Each link is one-time use and expires in 7 days.
      </p>
    </div>
  );
}
