'use client';

import { useEffect, useState } from 'react';
import { Instagram, Facebook, Youtube, Sparkles, Check, Ban, Info } from 'lucide-react';

// Portal-facing read-only mirror of LinkedSocialsSection. Clients see
// their four platform slots but can't edit — changes flow through the
// admin team. The "No account" and "Unset" states are both rendered
// as explicit chips so nothing looks like it's quietly missing data.

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

export function BrandProfileSocialsView({ clientId }: { clientId: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/social-slots`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setSlots(data.slots);
      } catch (err) {
        console.error('BrandProfileSocialsView: fetch failed', err);
        if (!cancelled) setError('Could not load social profiles');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-base font-semibold text-text-primary">Social profiles</h3>
      </div>
      <p className="text-xs text-text-muted leading-relaxed mb-4">
        The handles we use to analyze your social presence. Ask your Nativz
        team if anything here looks wrong.
      </p>

      {error ? (
        <p className="text-sm text-text-muted italic">{error}</p>
      ) : !slots ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {slots.map((slot) => (
            <SlotCard key={slot.platform} slot={slot} />
          ))}
        </div>
      )}
    </section>
  );
}

function SlotCard({ slot }: { slot: Slot }) {
  const meta = PLATFORM_META[slot.platform];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-nativz-border bg-background/30 px-3 py-2.5">
      <Icon size={18} className={meta.color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{meta.label}</p>
        <p className="text-xs text-text-muted truncate">
          {slot.status === 'linked' && slot.handle ? `@${slot.handle}` : null}
          {slot.status === 'no_account' ? 'Not on this platform' : null}
          {slot.status === 'unset' ? 'Not connected yet' : null}
        </p>
      </div>
      <StatusBadge status={slot.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: SlotStatus }) {
  if (status === 'linked') {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
        <Check size={10} /> Linked
      </span>
    );
  }
  if (status === 'no_account') {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-text-muted/10 text-text-muted font-semibold">
        <Ban size={10} /> None
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">
      <Info size={10} /> Unset
    </span>
  );
}
