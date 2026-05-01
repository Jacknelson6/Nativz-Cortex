'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Mail, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

/**
 * Notifications subpage for `/review`. Lists per-brand POCs who get
 * pinged when a calendar is sent, comments arrive, or follow-ups are
 * due. Admins and the brand's own viewers can manage the list.
 *
 * Auto-approval rule (mirrors the warning modal in the parent):
 *   When **every** contact has notifications disabled, share links
 *   for the brand are auto-approved on send (no human ever sees the
 *   review request). The warning fires the moment the user is about
 *   to flip the last enabled contact off, so they can't quietly opt
 *   the brand out.
 */

type Cadence = 'off' | 'daily' | 'every_3_days' | 'weekly' | 'biweekly';

const CADENCE_LABELS: Record<Cadence, string> = {
  off: 'No follow-ups',
  daily: 'Daily',
  every_3_days: 'Every 3 days',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
};

interface ContactRow {
  id: string;
  client_id: string;
  email: string;
  name: string | null;
  role: string | null;
  notifications_enabled: boolean;
  followup_cadence: Cadence;
  created_at: string | null;
  updated_at: string | null;
  /** 'brand' rows come from the brand-profile POC roster as informational
   *  defaults. They aren't editable in place; the user has to click
   *  "Customize" first to promote them into `content_drop_review_contacts`. */
  source?: 'review' | 'brand';
}

interface ReviewContactsPanelProps {
  clientId: string;
  brandName?: string;
  /** Called whenever the panel decides whether the brand is
   *  effectively muted (no enabled contacts). Lets the parent surface
   *  banners or block sends elsewhere if desired. */
  onAllOffChange?: (allOff: boolean) => void;
}

export function ReviewContactsPanel({
  clientId,
  brandName,
  onAllOffChange,
}: ReviewContactsPanelProps) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ email: '', name: '', role: '' });
  const [pendingToggle, setPendingToggle] = useState<{
    contactId: string;
    nextEnabled: boolean;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/review/contacts?clientId=${encodeURIComponent(clientId)}&include=brand`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Failed to load contacts');
      const data = (await res.json()) as { contacts: ContactRow[] };
      setContacts(data.contacts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Bubble up the "all off" signal so the parent can show a brand-wide
  // banner. Brand-sourced rows are always treated as enabled (the send
  // route uses them as fallback recipients), so the brand is only
  // "effectively muted" when there are no brand fallbacks AND every
  // review override is off.
  useEffect(() => {
    if (loading || contacts.length === 0) {
      onAllOffChange?.(false);
      return;
    }
    const hasBrandFallback = contacts.some((c) => c.source === 'brand');
    const reviewRows = contacts.filter((c) => c.source !== 'brand');
    if (hasBrandFallback || reviewRows.length === 0) {
      onAllOffChange?.(false);
      return;
    }
    onAllOffChange?.(reviewRows.every((c) => !c.notifications_enabled));
  }, [contacts, loading, onAllOffChange]);

  async function commitToggle(id: string, enabled: boolean) {
    // Optimistic update — flips back if the request fails.
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, notifications_enabled: enabled } : c)),
    );
    try {
      const res = await fetch(`/api/calendar/review/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notifications_enabled: enabled }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      // Revert.
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, notifications_enabled: !enabled } : c)),
      );
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  function onToggleClick(contact: ContactRow, nextEnabled: boolean) {
    if (nextEnabled) {
      // Turning ON never needs a warning.
      void commitToggle(contact.id, true);
      return;
    }
    // Turning OFF: would this leave zero enabled contacts?
    const stillOn = contacts.some(
      (c) => c.id !== contact.id && c.notifications_enabled,
    );
    if (!stillOn) {
      setPendingToggle({ contactId: contact.id, nextEnabled: false });
      return;
    }
    void commitToggle(contact.id, false);
  }

  async function updateCadence(id: string, cadence: Cadence) {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, followup_cadence: cadence } : c)),
    );
    try {
      const res = await fetch(`/api/calendar/review/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ followup_cadence: cadence }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
      void load();
    }
  }

  async function deleteContact(id: string) {
    const prev = contacts;
    setContacts((p) => p.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/calendar/review/contacts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      setContacts(prev);
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  // "Customize" on a brand-sourced row promotes it into a real
  // review_contacts row so the user can toggle notifications, change
  // cadence, or remove it. The brand profile entry stays untouched —
  // this only adds an override.
  async function customizeBrandContact(brandRow: ContactRow) {
    try {
      const res = await fetch('/api/calendar/review/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          email: brandRow.email,
          name: brandRow.name,
          role: brandRow.role,
          notifications_enabled: true,
          followup_cadence: brandRow.followup_cadence,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to customize contact');
      const promoted = data.contact as ContactRow;
      setContacts((prev) => [
        ...prev.filter(
          (c) => !(c.source === 'brand' && c.email.toLowerCase() === brandRow.email.toLowerCase()),
        ),
        { ...promoted, source: 'review' },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to customize contact');
    }
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.email.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/calendar/review/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          email: draft.email.trim(),
          name: draft.name.trim() || null,
          role: draft.role.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to add contact');
      setContacts((prev) => [...prev, data.contact as ContactRow]);
      setDraft({ email: '', name: '', role: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setAdding(false);
    }
  }

  const allOff =
    !loading && contacts.length > 0 && contacts.every((c) => !c.notifications_enabled);

  return (
    <div className="space-y-4">
      {allOff && (
        <div className="flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-medium">All notifications are off for this brand.</div>
            <div className="text-text-muted">
              New share links will auto-approve on send — no one will be emailed for
              review. Toggle a contact on to require human approval.
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <div className="flex items-center gap-3 border-b border-nativz-border px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              Notification contacts
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {brandName ? `${brandName} · ` : ''}
              {contacts.length} contact{contacts.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-text-muted">
            Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-text-secondary">No contacts yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              Add the people who should be emailed when calendars are shared and
              when comments come in.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-nativz-border/60">
            {contacts.map((c) => {
              const isBrand = c.source === 'brand';
              return (
                <li
                  key={`${c.source ?? 'review'}-${c.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {c.name || c.email}
                      </span>
                      {isBrand && (
                        <span
                          title="Coming from this brand's profile contacts. Click Customize to override notification settings just for content review."
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent-text/25 bg-accent-text/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text"
                        >
                          From brand profile
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-text-muted">
                      {c.name ? `${c.email}${c.role ? ' · ' + c.role : ''}` : c.role || '—'}
                    </div>
                  </div>

                  <Select
                    value={c.followup_cadence}
                    onChange={(e) => updateCadence(c.id, e.target.value as Cadence)}
                    className="h-9 w-44 py-0"
                    aria-label="Follow-up cadence"
                    disabled={isBrand}
                    options={(Object.keys(CADENCE_LABELS) as Cadence[]).map((k) => ({
                      value: k,
                      label: CADENCE_LABELS[k],
                    }))}
                  />

                  <ToggleSwitch
                    checked={c.notifications_enabled}
                    onChange={(v) => (isBrand ? void customizeBrandContact(c) : onToggleClick(c, v))}
                    ariaLabel={`Notifications for ${c.email}`}
                    disabled={isBrand}
                  />

                  {isBrand ? (
                    <button
                      type="button"
                      onClick={() => void customizeBrandContact(c)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-nativz-border px-2.5 text-xs font-medium text-text-secondary hover:border-accent-text/40 hover:bg-accent-text/10 hover:text-accent-text"
                      aria-label={`Customize notification settings for ${c.email}`}
                    >
                      <Sparkles className="size-3.5" />
                      Customize
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => deleteContact(c.id)}
                      className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-status-danger/10 hover:text-status-danger"
                      aria-label={`Remove ${c.email}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={addContact}
          className="flex flex-wrap items-center gap-2 border-t border-nativz-border bg-background/30 px-5 py-3 sm:flex-nowrap"
        >
          <Input
            type="email"
            placeholder="Email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            className="h-9 flex-1 min-w-[180px]"
            required
          />
          <Input
            type="text"
            placeholder="Name (optional)"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="h-9 w-44"
          />
          <Input
            type="text"
            placeholder="Role (optional)"
            value={draft.role}
            onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            className="h-9 w-44"
          />
          <Button type="submit" size="sm" disabled={adding || !draft.email.trim()}>
            <Plus size={14} />
            Add contact
          </Button>
        </form>
      </div>

      {/* All-off warning modal — only shows when toggling the *last*
       *  enabled contact off would mute the brand entirely. Inline so
       *  the parent's tooltip provider doesn't intercept clicks. */}
      {pendingToggle && (
        <AllOffWarningModal
          onCancel={() => setPendingToggle(null)}
          onConfirm={async () => {
            const target = pendingToggle;
            setPendingToggle(null);
            await commitToggle(target.contactId, target.nextEnabled);
          }}
        />
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-accent-text' : 'bg-nativz-border'
      } ${disabled ? 'opacity-60' : ''}`}
      title={disabled ? 'Click Customize first to change this' : undefined}
    >
      <span
        className={`inline-block size-3.5 transform rounded-full bg-background transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

function AllOffWarningModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--nz-ink)]/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border border-status-warning/30 bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-warning/10 text-status-warning">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">
              Turn off all notifications?
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              Turning all notifications off for content approvals means new
              calendars will be <span className="text-text-secondary">auto-approved</span>{' '}
              on send — no one will be emailed for review. Are you sure?
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Turn off anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
