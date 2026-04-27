'use client';

import { useEffect, useState, useTransition } from 'react';
import { Zap, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

// ── Platform SVG marks ──────────────────────────────────────────────────────
// Real brand glyphs (not lucide outlines — lucide ships Instagram/Facebook/
// YouTube as line-drawings and has no TikTok glyph, which read as generic).
// All four use `currentColor`, so Tailwind text classes drive the colour. We
// render them in `text-text-secondary` to match the Trend-Finder platform-pill
// treatment Jack dialed in — muted foreground that adapts per brand mode
// (near-white on Nativz dark, near-navy on AC paper).

type IconProps = { size?: number; className?: string };

function InstagramMark({ size = 18, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function TikTokMarkLocal({ size = 18, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function FacebookMark({ size = 18, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function YouTubeMarkLocal({ size = 18, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

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

const PLATFORM_META: Record<Platform, { label: string; icon: React.ComponentType<IconProps> }> = {
  instagram: { label: 'Instagram', icon: InstagramMark  },
  tiktok:    { label: 'TikTok',    icon: TikTokMarkLocal },
  facebook:  { label: 'Facebook',  icon: FacebookMark    },
  youtube:   { label: 'YouTube',   icon: YouTubeMarkLocal },
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

export function LinkedSocialsSection({
  clientId,
  readOnly = false,
}: {
  clientId: string;
  /** Viewer mode — inputs replaced with static link rows; no save flow. */
  readOnly?: boolean;
}) {
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
              readOnly={readOnly}
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
  platform, slot, onSave, readOnly,
}: {
  platform: Platform;
  slot: Slot | null;
  onSave: (input: string) => void;
  readOnly: boolean;
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

  // Viewer mode — render a static link row regardless of Zernio status.
  // Same row anatomy as the Zernio admin row so the layout reads
  // identically across admin/viewer; only the editing affordance is
  // gone. Empty slots show "Not linked" muted text.
  if (readOnly) {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <Icon size={18} className="shrink-0 text-text-secondary" />
        <div className="w-20 shrink-0">
          <span className="text-sm font-medium text-text-primary">{meta.label}</span>
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {currentUrl ? (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex-1 min-w-0 truncate text-sm text-accent-text hover:underline"
            >
              {currentUrl}
            </a>
          ) : (
            <span className="flex-1 text-sm text-text-muted italic">Not linked</span>
          )}
          {zernioManaged && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
              <Zap size={10} /> Connected
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <Icon size={18} className="shrink-0 text-text-secondary" />
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
            <Zap size={10} /> Connected
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
