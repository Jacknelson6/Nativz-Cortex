'use client';

/**
 * Single-client variant of the New Onboarding dialog. Used from the
 * Clients grid action menu, so the client is already selected — we only
 * need kind, platforms (smm), POC selection (from contacts), and the
 * welcome toggle. POST + redirect mirrors `onboarding-new-button.tsx`.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const PLATFORMS: Array<{ slug: string; label: string }> = [
  { slug: 'tiktok', label: 'TikTok' },
  { slug: 'instagram', label: 'Instagram' },
  { slug: 'youtube', label: 'YouTube' },
  { slug: 'facebook', label: 'Facebook' },
];

interface Contact {
  id: string;
  name: string;
  email: string;
  is_primary?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

const CUSTOM = '__custom__';
const DEFAULT_POC = '';

export function StartOnboardingDialog({ open, onClose, clientId, clientName }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<'smm' | 'editing'>('smm');
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'instagram']);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // POC state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [pocChoice, setPocChoice] = useState<string>(DEFAULT_POC);
  const [customEmail, setCustomEmail] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function load() {
      setContactsLoading(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/contacts`);
        const j = (await res.json().catch(() => null)) as Contact[] | null;
        if (!alive) return;
        if (Array.isArray(j)) {
          setContacts(j);
          // Default to primary contact if one exists; otherwise leave on
          // "(use brand profile primary)" which falls back server-side.
          const primary = j.find((c) => c.is_primary);
          if (primary) setPocChoice(primary.id);
        }
      } finally {
        if (alive) setContactsLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [open, clientId]);

  function togglePlatform(slug: string) {
    setPlatforms((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug],
    );
  }

  function resolvePocEmail(): string | undefined {
    if (pocChoice === CUSTOM) return customEmail.trim() || undefined;
    if (!pocChoice) return undefined;
    return contacts.find((c) => c.id === pocChoice)?.email;
  }

  async function saveNewContact() {
    if (!newContact.name.trim() || !newContact.email.trim()) {
      setContactError('Name and email required.');
      return;
    }
    setSavingContact(true);
    setContactError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newContact.name.trim(),
          email: newContact.email.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContactError(data.error ?? 'Could not save contact.');
        return;
      }
      const c = data as Contact;
      setContacts((prev) => [...prev, c]);
      setPocChoice(c.id);
      setNewContact({ name: '', email: '' });
      setAddingContact(false);
    } finally {
      setSavingContact(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/onboardings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          kind,
          platforms: kind === 'smm' ? platforms : undefined,
          poc_email: resolvePocEmail(),
          send_welcome: sendWelcome,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'failed to create onboarding');
      }
      const { row } = (await res.json()) as { row: { id: string } };
      onClose();
      router.push(`/admin/onboarding/${row.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Start onboarding for ${clientName}`}
      maxWidth="lg"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-[11px] uppercase tracking-wide text-text-secondary">Kind</label>
          <div className="flex gap-2">
            {(['smm', 'editing'] as const).map((k) => (
              <Button
                key={k}
                variant={kind === k ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setKind(k)}
                disabled={submitting}
                className="flex-1"
              >
                {k === 'smm' ? 'Social media' : 'Editing'}
              </Button>
            ))}
          </div>
        </div>

        {kind === 'smm' && (
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wide text-text-secondary">
              Platforms
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <Button
                  key={p.slug}
                  variant={platforms.includes(p.slug) ? 'primary' : 'outline'}
                  size="xs"
                  shape="pill"
                  onClick={() => togglePlatform(p.slug)}
                  disabled={submitting}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[11px] uppercase tracking-wide text-text-secondary">
            Point of contact
          </label>
          {contactsLoading ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 size={12} className="animate-spin" />
              Loading contacts...
            </div>
          ) : (
            <select
              value={pocChoice}
              onChange={(e) => setPocChoice(e.target.value)}
              disabled={submitting}
              className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              <option value={DEFAULT_POC}>Use brand profile primary contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                  {c.is_primary ? ' — primary' : ''}
                </option>
              ))}
              <option value={CUSTOM}>Custom email...</option>
            </select>
          )}

          {pocChoice === CUSTOM && (
            <Input
              type="email"
              placeholder="someone@brand.com"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              disabled={submitting}
            />
          )}

          {!addingContact ? (
            <button
              type="button"
              onClick={() => setAddingContact(true)}
              disabled={submitting}
              className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline disabled:opacity-50"
            >
              <Plus size={12} />
              Add a new contact
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-nativz-border bg-surface px-3 py-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Name"
                  value={newContact.name}
                  onChange={(e) => setNewContact((d) => ({ ...d, name: e.target.value }))}
                  disabled={savingContact || submitting}
                />
                <Input
                  type="email"
                  placeholder="email@brand.com"
                  value={newContact.email}
                  onChange={(e) => setNewContact((d) => ({ ...d, email: e.target.value }))}
                  disabled={savingContact || submitting}
                />
              </div>
              {contactError && (
                <div className="text-xs text-status-error">{contactError}</div>
              )}
              <div className="flex gap-2">
                <Button
                  size="xs"
                  onClick={saveNewContact}
                  disabled={savingContact || submitting}
                >
                  {savingContact ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save contact'
                  )}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setAddingContact(false);
                    setContactError(null);
                  }}
                  disabled={savingContact || submitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={sendWelcome}
            onChange={(e) => setSendWelcome(e.target.checked)}
            disabled={submitting}
            className="rounded border-border"
          />
          Send welcome email now
        </label>

        {error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Starting...
              </>
            ) : (
              'Start onboarding'
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
