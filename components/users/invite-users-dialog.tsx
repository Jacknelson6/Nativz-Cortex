'use client';

import { useState, useEffect } from 'react';
import {
  UserPlus, Building2, Shield, Loader2, Copy, Check, Send, Minus, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { ClientPickerButton, type ClientOption as PickerClientOption } from '@/components/ui/client-picker';

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
}

type Tab = 'portal' | 'admin';

export function InviteUsersDialog({ open, onClose, onInvited }: InviteUsersDialogProps) {
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
    <Dialog open={open} onClose={handleClose} title="Invite users" maxWidth="lg">
      <div className="space-y-5">
        {/* Tab switcher — centered, larger hit area */}
        <div className="flex justify-center">
          <div className="flex gap-1 rounded-lg border border-nativz-border p-1">
            <button
              onClick={() => { setTab('portal'); setGenerated([]); }}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                tab === 'portal'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Building2 size={14} />
              Portal user
            </button>
            <button
              onClick={() => { setTab('admin'); setGenerated([]); }}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                tab === 'admin'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Shield size={14} />
              Admin / team
            </button>
          </div>
        </div>

        {tab === 'portal' ? (
          <PortalInviteForm onInvitesCreated={handleInvitesCreated} />
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

function PortalInviteForm({
  onInvitesCreated,
}: {
  onInvitesCreated: (heading: string, invites: GeneratedInvite[]) => void;
}) {
  const [clients, setClients] = useState<PickerClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
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
  }, []);

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

    setSubmitting(true);
    try {
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
      {/* Client picker — uses the same bento modal as the rest of the app */}
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
        <button
          onClick={handleGenerate}
          disabled={submitting || !clientId}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <><Loader2 size={13} className="animate-spin" /> Generating…</>
          ) : (
            <><UserPlus size={13} /> Generate {count > 1 ? `${count} invites` : 'invite'}</>
          )}
        </button>
      </div>
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
        <button
          onClick={handleSendInvite}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <><Loader2 size={13} className="animate-spin" /> Sending…</>
          ) : (
            <><Send size={13} /> Send invite</>
          )}
        </button>
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
