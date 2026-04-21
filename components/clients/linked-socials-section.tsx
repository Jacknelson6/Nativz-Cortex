'use client';

import { useEffect, useState, useTransition } from 'react';
import { Instagram, Facebook, Youtube, Sparkles, Zap, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up (polish pass 3, 2026-04-21): radical simplification
// per Jack. This section is just "a spot to put the URL for each page."
// No UNSET chip, no "No account" button, no "Connect Zernio" button,
// no "Clear" button. Just four rows with one URL input each.
//
// Behavior:
//   - If Zernio is connected for a platform, the URL is shown read-only
//     + a small "Managed via Zernio" note. OAuth is driven elsewhere.
//   - Otherwise, a URL/handle input. Blur-to-save. Empty = not linked
//     (analysis tools skip it silently — no explicit "no account" state
//     needs to be exposed to the admin).
//   - Users can paste either a full URL (https://instagram.com/foo) or
//     a bare handle (foo or @foo). We normalize on save.

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';

interface Slot {
  platform: Platform;
  status: 'linked' | 'no_account' | 'unset';
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

const PLATFORM_ORDER: Platform[] = ['instagram', 'tiktok', 'facebook', 'youtube'];

/** Canonical URL for a platform + handle. Used for both display + the
 *  `href` on the external-link chip. */
function canonicalUrl(platform: Platform, handle: string): string {
  const h = handle.replace(/^@+/, '');
  switch (platform) {
    case 'instagram': return `https://instagram.com/${h}`;
    case 'tiktok':    return `https://tiktok.com/@${h}`;
    case 'facebook':  return `https://facebook.com/${h}`;
    case 'youtube':   return `https://youtube.com/@${h}`;
  }
}

/** Normalize whatever the admin pasted (URL or handle) into a bare
 *  handle for storage. Accepts:
 *   - https://instagram.com/coffeeco → coffeeco
 *   - @coffeeco → coffeeco
 *   - coffeeco → coffeeco
 *  Returns null for empty/whitespace input. */
function normalizeInput(raw: string, platform: Platform): string | null {
  const s = raw.trim();
  if (!s) return null;

  // If it looks like a URL, pull the last meaningful path segment.
  const urlMatch = s.match(/^https?:\/\/(?:www\.)?[^/]+\/(.+?)(?:[/?#]|$)/i);
  if (urlMatch?.[1]) {
    // TikTok URLs are /@handle; strip the @.
    // YouTube URLs can be /@handle, /c/handle, /channel/id, /user/handle — pick the last segment.
    const seg = urlMatch[1].split('/').pop() ?? urlMatch[1];
    return seg.replace(/^@+/, '');
  }

  // Otherwise treat it as a handle (with or without @).
  const cleaned = s.replace(/^@+/, '');
  // Very lenient sanity check — block obvious garbage (spaces, etc.).
  if (/\s/.test(cleaned)) {
    void platform; // reserved for per-platform validation later
    return null;
  }
  return cleaned;
}

export function LinkedSocialsSection({ clientId }: { clientId: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
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
      toast.error('Failed to load social profiles');
    }
  }

  /** Single PATCH flow used for both "save a new handle" and "clear"
   *  (empty string → status: 'unset' deletes the row). */
  async function save(platform: Platform, rawInput: string): Promise<void> {
    const normalized = normalizeInput(rawInput, platform);
    const body = normalized
      ? { platform, status: 'linked' as const, handle: normalized }
      : { platform, status: 'unset' as const };
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/social-slots`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to save');
        return;
      }
      toast.success('Saved', { duration: 1200 });
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

  const byPlatform = new Map(slots.map((s) => [s.platform, s] as const));

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
      <Header />
      <div className="divide-y divide-nativz-border/50 -mx-5">
        {PLATFORM_ORDER.map((platform) => {
          const slot = byPlatform.get(platform);
          return (
            <SlotRow
              key={platform}
              platform={platform}
              slot={slot ?? null}
              onSave={(input) => void save(platform, input)}
            />
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

function SlotRow({
  platform, slot, onSave,
}: {
  platform: Platform;
  slot: Slot | null;
  onSave: (input: string) => void;
}) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  const zernioManaged = slot?.zernio_connected ?? false;
  const currentUrl = slot?.handle ? canonicalUrl(platform, slot.handle) : '';

  // Draft mirrors the slot URL while the admin is typing. A change +
  // blur triggers a save; pressing Enter blurs.
  const [draft, setDraft] = useState(currentUrl);
  useEffect(() => { setDraft(currentUrl); }, [currentUrl]);

  const dirty = draft.trim() !== currentUrl;

  function commit() {
    if (!dirty) return;
    onSave(draft);
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <Icon size={18} className={`shrink-0 ${meta.color}`} />
      <div className="w-20 shrink-0">
        <span className="text-sm font-medium text-text-primary">{meta.label}</span>
      </div>

      {zernioManaged ? (
        /* Zernio-OAuth-backed → show the URL as a static link. OAuth
           disconnection lives on the scheduler page; this surface never
           disturbs a live connection. */
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex-1 min-w-0 truncate text-sm text-accent-text hover:underline"
          >
            {currentUrl}
          </a>
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
            <Zap size={10} /> Zernio
          </span>
        </div>
      ) : (
        /* Not Zernio — plain URL input. Accepts a full URL or a handle.
           Blur commits; Enter blurs. External-link chip appears once
           the field has a saved value to make the URL tappable. */
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder={`https://${platformDomain(platform)}/…`}
            className="flex-1 min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-text-primary placeholder:text-text-muted/60 hover:border-nativz-border focus:border-accent/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
          />
          {!dirty && currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-text-muted hover:text-text-primary p-1 rounded"
              title="Open profile"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function platformDomain(p: Platform): string {
  switch (p) {
    case 'instagram': return 'instagram.com';
    case 'tiktok':    return 'tiktok.com/@';
    case 'facebook':  return 'facebook.com';
    case 'youtube':   return 'youtube.com/@';
  }
}
