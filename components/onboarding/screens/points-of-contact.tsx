'use client';

/**
 * Points of contact screen.
 *
 * Mirrors the brand's `contacts` table via the public share-token CRUD.
 * The client adds anyone we should loop in, marks one primary, and can
 * forward the onboarding link to a teammate so they can fill in the
 * pieces only they have visibility on.
 */

import { useEffect, useState } from 'react';
import { Loader2, Star, Trash2, Send, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PointOfContactEntry, PointsOfContactState } from '@/lib/onboarding/types';

interface Props {
  value: Record<string, unknown> | null;
  token: string;
  clientName: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

export function PointsOfContactScreen({ value, token, clientName, submitting, onSubmit }: Props) {
  const initial = (value as PointsOfContactState | null) ?? { contacts: [] };
  const [contacts, setContacts] = useState<PointOfContactEntry[]>(initial.contacts ?? []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // New row draft.
  const [draft, setDraft] = useState({ name: '', email: '', role: '', is_primary: false });
  const [draftError, setDraftError] = useState<string | null>(null);

  // Invite teammate UI.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ to: '', name: '', message: '' });
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/onboarding/${token}/contacts`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { contacts?: PointOfContactEntry[] }) => {
        if (alive) setContacts(j.contacts ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function addContact() {
    setDraftError(null);
    if (!draft.name.trim() || !draft.email.trim()) {
      setDraftError('Name and email are required.');
      return;
    }
    setBusy('add');
    try {
      const res = await fetch(`/api/public/onboarding/${token}/contacts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim(),
          role: draft.role.trim() || null,
          is_primary: draft.is_primary,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setDraftError(j.error ?? 'Could not add contact.');
        return;
      }
      const { contact } = (await res.json()) as { contact: PointOfContactEntry };
      const next = draft.is_primary
        ? [contact, ...contacts.map((c) => ({ ...c, is_primary: false }))]
        : [...contacts, contact];
      setContacts(next);
      setDraft({ name: '', email: '', role: '', is_primary: false });
    } finally {
      setBusy(null);
    }
  }

  async function setPrimary(contact_id: string) {
    setBusy(contact_id);
    try {
      const res = await fetch(`/api/public/onboarding/${token}/contacts`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: contact_id, is_primary: true }),
      });
      if (res.ok) {
        setContacts((prev) =>
          prev.map((c) => ({ ...c, is_primary: c.contact_id === contact_id })),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function removeContact(contact_id: string) {
    setBusy(contact_id);
    try {
      const res = await fetch(`/api/public/onboarding/${token}/contacts`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: contact_id }),
      });
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.contact_id !== contact_id));
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendInvite() {
    setInviteError(null);
    if (!invite.to.trim()) {
      setInviteError('Email required.');
      return;
    }
    setBusy('invite');
    try {
      const res = await fetch(`/api/public/onboarding/${token}/invite-poc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: invite.to.trim(),
          name: invite.name.trim() || null,
          message: invite.message.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setInviteError(j.error ?? 'Could not send invite.');
        return;
      }
      setInviteSent(true);
      setInvite({ to: '', name: '', message: '' });
      setTimeout(() => {
        setInviteOpen(false);
        setInviteSent(false);
      }, 1800);
    } finally {
      setBusy(null);
    }
  }

  const canContinue = contacts.length > 0 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canContinue) return;
        onSubmit({ contacts });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Who should we loop in?
        </h1>
        <p className="text-base text-text-secondary">
          Add anyone the strategist or editor should email about {clientName}. Mark one as primary.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading contacts...
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <div
              key={c.contact_id ?? c.email}
              className="flex flex-col gap-2 rounded-lg border border-nativz-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  {c.name}
                  {c.is_primary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text">
                      <Star size={10} />
                      Primary
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-muted">
                  {c.email}
                  {c.role && <span className="text-text-secondary"> · {c.role}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!c.is_primary && c.contact_id && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setPrimary(c.contact_id!)}
                    disabled={busy === c.contact_id || submitting}
                  >
                    Make primary
                  </Button>
                )}
                {c.contact_id && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => removeContact(c.contact_id!)}
                    disabled={busy === c.contact_id || submitting}
                  >
                    <Trash2 size={12} />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="space-y-3 rounded-lg border border-dashed border-nativz-border bg-surface px-4 py-4">
            <div className="text-sm font-medium text-text-primary">Add a contact</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="poc-name"
                label="Name"
                placeholder="Jane Doe"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                disabled={submitting}
              />
              <Input
                id="poc-email"
                label="Email"
                type="email"
                placeholder="jane@brand.com"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                disabled={submitting}
              />
              <Input
                id="poc-role"
                label="Role (optional)"
                placeholder="Marketing lead"
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                disabled={submitting}
              />
              <label className="flex items-end gap-2 pb-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.is_primary}
                  onChange={(e) => setDraft((d) => ({ ...d, is_primary: e.target.checked }))}
                  disabled={submitting}
                />
                Make them primary
              </label>
            </div>
            {draftError && <div className="text-xs text-status-error">{draftError}</div>}
            <Button
              type="button"
              size="sm"
              onClick={addContact}
              disabled={busy === 'add' || submitting}
            >
              {busy === 'add' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Add contact
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-nativz-border bg-surface px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary">Need a teammate to fill this in?</div>
            <p className="text-xs text-text-secondary">
              Forward this onboarding link to whoever owns the pieces you don’t.
            </p>
          </div>
          {!inviteOpen && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setInviteOpen(true)}
              disabled={submitting}
            >
              <Send size={14} />
              Send onboarding link
            </Button>
          )}
        </div>

        {inviteOpen && (
          <div className="mt-3 space-y-3 border-t border-nativz-border pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="invite-to"
                label="Their email"
                type="email"
                placeholder="teammate@brand.com"
                value={invite.to}
                onChange={(e) => setInvite((d) => ({ ...d, to: e.target.value }))}
                disabled={busy === 'invite' || submitting}
              />
              <Input
                id="invite-name"
                label="Name (optional)"
                placeholder="Alex"
                value={invite.name}
                onChange={(e) => setInvite((d) => ({ ...d, name: e.target.value }))}
                disabled={busy === 'invite' || submitting}
              />
            </div>
            <Input
              id="invite-message"
              label="Message (optional)"
              placeholder="Quick context for them..."
              value={invite.message}
              onChange={(e) => setInvite((d) => ({ ...d, message: e.target.value }))}
              disabled={busy === 'invite' || submitting}
            />
            {inviteError && <div className="text-xs text-status-error">{inviteError}</div>}
            {inviteSent && <div className="text-xs text-status-success">Link sent.</div>}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={sendInvite}
                disabled={busy === 'invite' || submitting || inviteSent}
              >
                {busy === 'invite' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send link'
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteError(null);
                }}
                disabled={busy === 'invite' || submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button type="submit" size="lg" disabled={!canContinue} className="w-full sm:w-auto">
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </form>
  );
}
