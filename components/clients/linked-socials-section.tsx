'use client';

import { useEffect, useState, useTransition } from 'react';
import { Instagram, Facebook, Youtube, Pencil, X, Check, Ban, Sparkles, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up: admin surface for the four "social slots" on a
// client. One row per platform. Status is linked | no_account | unset;
// the row's affordances change based on which state it's in.

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';
type SlotStatus = 'linked' | 'no_account' | 'unset';

interface Slot {
  platform: Platform;
  status: SlotStatus;
  handle: string | null;
  avatar_url: string | null;
  zernio_connected: boolean;
  website_scraped: boolean;
  updated_at: string | null;
}

const PLATFORM_META: Record<Platform, { label: string; icon: React.ElementType; color: string }> = {
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-400' },
  tiktok:    { label: 'TikTok',    icon: Sparkles,  color: 'text-cyan-400' },
  facebook:  { label: 'Facebook',  icon: Facebook,  color: 'text-blue-400' },
  youtube:   { label: 'YouTube',   icon: Youtube,   color: 'text-red-400' },
};

export function LinkedSocialsSection({ clientId }: { clientId: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [draftHandle, setDraftHandle] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => { void fetchSlots(); }, [clientId]);

  async function fetchSlots() {
    try {
      const res = await fetch(`/api/clients/${clientId}/social-slots`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSlots(data.slots);
    } catch (err) {
      console.error('LinkedSocialsSection: fetch failed', err);
      toast.error('Failed to load social slots');
    }
  }

  function beginEdit(slot: Slot) {
    setEditing(slot.platform);
    setDraftHandle(slot.handle ?? '');
  }

  async function saveLinked(platform: Platform) {
    const handle = draftHandle.trim().replace(/^@+/, '');
    if (!handle) {
      toast.error('Enter a handle or cancel');
      return;
    }
    await patchSlot(platform, { status: 'linked', handle });
    setEditing(null);
  }

  async function markNoAccount(platform: Platform) {
    await patchSlot(platform, { status: 'no_account' });
  }

  async function clearSlot(platform: Platform) {
    await patchSlot(platform, { status: 'unset' });
  }

  async function patchSlot(platform: Platform, body: Record<string, unknown>) {
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/social-slots`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to save');
        return;
      }
      toast.success('Saved');
      void fetchSlots();
    });
  }

  if (!slots) {
    return (
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <Header />
        <p className="text-sm text-text-muted">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      <Header />
      <p className="text-xs text-text-muted -mt-2 leading-relaxed">
        One handle per platform powers analytics, competitor diffs, and
        audits. If the brand isn&apos;t on a platform, mark it as <strong>No account</strong>
        — analysis tools will skip it quietly instead of asking.
      </p>
      <div className="divide-y divide-nativz-border/50 -mx-5">
        {slots.map((slot) => {
          const meta = PLATFORM_META[slot.platform];
          const Icon = meta.icon;
          const isEditing = editing === slot.platform;
          return (
            <div key={slot.platform} className="flex items-center gap-3 px-5 py-3">
              <Icon size={18} className={meta.color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-text-primary">{meta.label}</span>
                  <StatusChip slot={slot} />
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-sm text-text-muted">@</span>
                    <input
                      type="text"
                      value={draftHandle}
                      onChange={(e) => setDraftHandle(e.target.value)}
                      placeholder="handle"
                      className="flex-1 rounded border border-nativz-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveLinked(slot.platform);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                    <button
                      onClick={() => void saveLinked(slot.platform)}
                      className="rounded bg-accent-text/10 p-1.5 text-accent-text hover:bg-accent-text/20"
                      aria-label="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded p-1.5 text-text-muted hover:bg-nativz-border/30"
                      aria-label="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted truncate">
                    {slot.status === 'linked' && slot.handle ? `@${slot.handle}` : null}
                    {slot.status === 'no_account' ? 'No account on this platform' : null}
                    {slot.status === 'unset' ? 'Not linked yet' : null}
                  </p>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-1">
                  {slot.status !== 'linked' && (
                    <button
                      onClick={() => beginEdit(slot)}
                      className="text-xs text-accent-text hover:underline px-2 py-1 rounded flex items-center gap-1"
                      title="Link a handle"
                    >
                      <LinkIcon size={12} /> Link
                    </button>
                  )}
                  {slot.status === 'linked' && (
                    <button
                      onClick={() => beginEdit(slot)}
                      className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded flex items-center gap-1"
                      title="Edit handle"
                      disabled={slot.zernio_connected}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                  {slot.status !== 'no_account' && !slot.zernio_connected && (
                    <button
                      onClick={() => void markNoAccount(slot.platform)}
                      className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 rounded flex items-center gap-1"
                      title="Mark as no account"
                    >
                      <Ban size={12} /> No account
                    </button>
                  )}
                  {slot.status !== 'unset' && !slot.zernio_connected && (
                    <button
                      onClick={() => void clearSlot(slot.platform)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded"
                      title="Clear this slot"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 mb-1">
      <h3 className="text-sm font-semibold text-text-primary">Linked social profiles</h3>
    </div>
  );
}

function StatusChip({ slot }: { slot: Slot }) {
  if (slot.status === 'linked') {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
        Linked
      </span>
    );
  }
  if (slot.status === 'no_account') {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-text-muted/10 text-text-muted font-semibold">
        No account
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">
      Unset
    </span>
  );
}
