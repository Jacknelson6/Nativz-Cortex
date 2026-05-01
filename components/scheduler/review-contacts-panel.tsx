'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Mail } from 'lucide-react';

/**
 * Notifications subpage for `/review`. Read-only mirror of the brand
 * profile's POC roster — brand profile is the single source of truth
 * for who gets emailed when a calendar is sent, comments arrive, or
 * follow-ups fire. Editing happens on the brand profile, not here.
 */

interface ContactRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

interface ReviewContactsPanelProps {
  clientId: string;
  brandName?: string;
  /** Optional brand slug so the "Manage in brand profile" CTA can deep
   *  link straight to the POC list. When absent, the CTA falls back to
   *  the clients index. */
  brandSlug?: string | null;
}

export function ReviewContactsPanel({
  clientId,
  brandName,
  brandSlug,
}: ReviewContactsPanelProps) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/calendar/review/contacts?clientId=${encodeURIComponent(clientId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('Failed to load contacts');
        const data = (await res.json()) as { contacts: ContactRow[] };
        if (!cancelled) setContacts(data.contacts ?? []);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load contacts');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const manageHref = brandSlug
    ? `/admin/clients/${brandSlug}/settings/brand`
    : '/admin/clients';

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center gap-3 border-b border-nativz-border px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary">
            Notification contacts
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            {brandName ? `${brandName} · ` : ''}
            {loading
              ? 'Loading…'
              : `${contacts.length} contact${contacts.length === 1 ? '' : 's'} from the brand profile`}
          </div>
        </div>
        <a
          href={manageHref}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-accent-surface/40 px-2.5 text-[11px] font-medium text-accent-text hover:bg-accent-surface/60"
        >
          Manage in brand profile
          <ExternalLink size={11} />
        </a>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-text-muted">
          Loading contacts…
        </div>
      ) : contacts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-text-secondary">No contacts on the brand profile.</p>
          <p className="mt-1 text-xs text-text-muted">
            Add a POC on the brand profile and they&apos;ll show up here automatically.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">
                  {c.name?.trim() ? c.name : c.email}
                </div>
                <div className="truncate text-xs text-text-muted">
                  {c.name?.trim() ? c.email : c.role || '—'}
                </div>
              </div>
              {c.role?.trim() && c.name?.trim() && (
                <span className="shrink-0 text-xs text-text-muted">{c.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
