'use client';

import useSWR from 'swr';
import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Gift,
  Info,
  Sparkles,
  X,
} from 'lucide-react';

// Style + icon shapes must match banners-tab.tsx so the composer preview
// matches what renders here. When you change either table, change both.
type Style = 'info' | 'warning' | 'success' | 'error' | 'event' | 'promo';
type Icon = 'info' | 'alert' | 'calendar' | 'sparkles' | 'gift' | 'check' | 'bell';
type Position = 'top' | 'sidebar' | 'modal';

interface ActiveBanner {
  id: string;
  title: string;
  description: string | null;
  style: Style;
  icon: Icon;
  link_url: string | null;
  link_text: string | null;
  position: Position;
  priority: number;
  dismissible: boolean;
}

const STYLE_CLASSES: Record<Style, { container: string; title: string; icon: string; link: string }> = {
  info: {
    container: 'bg-sky-500/10 border-sky-500/30',
    title: 'text-sky-500',
    icon: 'text-sky-500',
    link: 'text-sky-500 hover:text-sky-400',
  },
  warning: {
    container: 'bg-amber-500/10 border-amber-500/30',
    title: 'text-amber-500',
    icon: 'text-amber-500',
    link: 'text-amber-500 hover:text-amber-400',
  },
  success: {
    container: 'bg-emerald-500/10 border-emerald-500/30',
    title: 'text-emerald-500',
    icon: 'text-emerald-500',
    link: 'text-emerald-500 hover:text-emerald-400',
  },
  error: {
    container: 'bg-rose-500/10 border-rose-500/30',
    title: 'text-rose-500',
    icon: 'text-rose-500',
    link: 'text-rose-500 hover:text-rose-400',
  },
  event: {
    container: 'bg-violet-500/10 border-violet-500/30',
    title: 'text-violet-400',
    icon: 'text-violet-400',
    link: 'text-violet-400 hover:text-violet-300',
  },
  promo: {
    container: 'bg-fuchsia-500/10 border-fuchsia-500/30',
    title: 'text-fuchsia-400',
    icon: 'text-fuchsia-400',
    link: 'text-fuchsia-400 hover:text-fuchsia-300',
  },
};

const ICON_COMPONENTS: Record<Icon, typeof Info> = {
  info: Info,
  alert: AlertTriangle,
  calendar: Calendar,
  sparkles: Sparkles,
  gift: Gift,
  check: CheckCircle2,
  bell: Bell,
};

/**
 * Renders every active top-of-page banner for the current user. Mounts inside
 * the shell and reads /api/banners/active. Dismiss is durable (posts to the
 * API); locally hidden until the next page load so the banner disappears
 * immediately on click without waiting for refetch.
 */
export function BannerStrip() {
  const { data } = useSWR<{ banners: ActiveBanner[] }>('/api/banners/active', {
    // Cheap enough to refetch every few minutes so new banners show up
    // without a full page reload.
    refreshInterval: 2 * 60_000,
  });
  const [dismissedLocal, setDismissedLocal] = useState<Set<string>>(new Set());

  const banners = (data?.banners ?? [])
    .filter((b) => b.position === 'top')
    .filter((b) => !dismissedLocal.has(b.id));

  if (banners.length === 0) return null;

  async function dismiss(id: string) {
    setDismissedLocal((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await fetch(`/api/banners/${id}/dismiss`, { method: 'POST' });
    } catch {
      // If the request fails the local state still hides it for this session;
      // next page load will reconcile with the server.
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {banners.map((b) => (
        <BannerItem key={b.id} banner={b} onDismiss={() => dismiss(b.id)} />
      ))}
    </div>
  );
}

function BannerItem({ banner, onDismiss }: { banner: ActiveBanner; onDismiss: () => void }) {
  const styles = STYLE_CLASSES[banner.style] ?? STYLE_CLASSES.info;
  const IconComponent = ICON_COMPONENTS[banner.icon] ?? Info;

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${styles.container}`}
    >
      <IconComponent size={16} className={`${styles.icon} shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${styles.title}`}>{banner.title}</p>
        {banner.description ? (
          <p className="text-xs text-text-secondary mt-0.5">{banner.description}</p>
        ) : null}
        {banner.link_url && banner.link_text ? (
          <a
            href={banner.link_url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1 text-xs mt-1 ${styles.link}`}
          >
            {banner.link_text}
            <ExternalLink size={11} />
          </a>
        ) : null}
      </div>
      {banner.dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
