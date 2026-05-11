'use client';

/**
 * Per-client notification control center.
 *
 * Two-column toggle grid: each registered client-scoped notification gets
 * a row with a Google Chat / webhook switch and an email switch. Cells
 * for channels the notification doesn't fire on render as dashes so the
 * grid stays a clean rectangle.
 *
 * Backed by `/api/clients/[id]/notification-settings` — GET loads the
 * full matrix on mount, PATCH upserts a single (key, channel) toggle.
 * Optimistic with snapback on failure.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  MessageSquare,
  Mail,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  NOTIFICATION_REGISTRY,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationDefinition,
} from '@/lib/notifications/registry';

interface SettingRow {
  notificationKey: string;
  channel: NotificationChannel;
  enabled: boolean;
}

type SettingMap = Map<string, boolean>;

function settingKey(key: string, channel: NotificationChannel) {
  return `${key}|${channel}`;
}

export function ClientNotificationsGrid({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingMap>(() => new Map());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Only client-scoped entries get a row. We also rely on registry order
  // so admins can move things around in code without re-sorting in the UI.
  const grouped = useMemo(() => groupClientScoped(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/clients/${encodeURIComponent(clientId)}/notification-settings`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('Failed to load notification settings');
        const data = (await res.json()) as { settings: SettingRow[] };
        if (cancelled) return;
        const next = new Map<string, boolean>();
        for (const row of data.settings) {
          next.set(settingKey(row.notificationKey, row.channel), row.enabled);
        }
        setSettings(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function toggle(
    notificationKey: string,
    channel: NotificationChannel,
    next: boolean,
  ) {
    const sk = settingKey(notificationKey, channel);
    const prev = settings.get(sk) ?? true;
    // Optimistic update.
    setSettings((m) => {
      const copy = new Map(m);
      copy.set(sk, next);
      return copy;
    });
    setSavingKeys((s) => {
      const copy = new Set(s);
      copy.add(sk);
      return copy;
    });
    try {
      const res = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/notification-settings`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            notificationKey,
            channel,
            enabled: next,
          }),
        },
      );
      if (!res.ok) throw new Error('save failed');
    } catch {
      // Snap back.
      setSettings((m) => {
        const copy = new Map(m);
        copy.set(sk, prev);
        return copy;
      });
      toast.error('Could not update notification');
    } finally {
      setSavingKeys((s) => {
        const copy = new Set(s);
        copy.delete(sk);
        return copy;
      });
    }
  }

  if (error) {
    return (
      <Card className="border-nativz-border bg-surface p-5 text-sm text-red-400">
        {error}
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-nativz-border bg-surface p-8">
        <div className="flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-accent-text" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-nativz-border bg-surface">
      <header className="border-b border-nativz-border px-5 py-4">
        <h3 className="text-sm font-medium text-text-primary">
          Notifications
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Per-channel toggles for every automated alert this brand can
          receive. Disabling here suppresses delivery for this brand only,
          everything else keeps firing.
        </p>
      </header>

      {/* Column headers — sticky-ish layout via grid template. */}
      <div className="grid grid-cols-[1fr_120px_120px] items-center gap-4 border-b border-nativz-border bg-white/[0.015] px-5 py-2.5 text-[11px] uppercase tracking-wide text-text-muted">
        <span>Notification</span>
        <span className="flex items-center justify-center gap-1.5">
          <MessageSquare size={12} /> Google Chat
        </span>
        <span className="flex items-center justify-center gap-1.5">
          <Mail size={12} /> Email
        </span>
      </div>

      <div className="divide-y divide-nativz-border">
        {grouped.map((group) => (
          <section key={group.category}>
            <div className="bg-white/[0.02] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {NOTIFICATION_CATEGORY_LABELS[group.category]}
            </div>
            <ul className="divide-y divide-nativz-border">
              {group.items.map((def) => {
                const chatSk = settingKey(def.key, 'chat');
                const emailSk = settingKey(def.key, 'email');
                const chatEnabled = settings.get(chatSk) ?? true;
                const emailEnabled = settings.get(emailSk) ?? true;
                const chatSaving = savingKeys.has(chatSk);
                const emailSaving = savingKeys.has(emailSk);
                return (
                  <li
                    key={def.key}
                    className="grid grid-cols-[1fr_120px_120px] items-center gap-4 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">
                        {def.label}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {def.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-center">
                      <ChannelToggle
                        supported={!!def.channels.chat}
                        enabled={chatEnabled}
                        saving={chatSaving}
                        label={`${def.label} — Google Chat`}
                        onChange={(v) => toggle(def.key, 'chat', v)}
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <ChannelToggle
                        supported={!!def.channels.email}
                        enabled={emailEnabled}
                        saving={emailSaving}
                        label={`${def.label} — Email`}
                        onChange={(v) => toggle(def.key, 'email', v)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function ChannelToggle({
  supported,
  enabled,
  saving,
  label,
  onChange,
}: {
  supported: boolean;
  enabled: boolean;
  saving: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  if (!supported) {
    return <span className="text-xs text-text-muted/60">—</span>;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={saving}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? 'bg-accent' : 'bg-nativz-border'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

interface CategoryGroup {
  category: NotificationCategory;
  items: NotificationDefinition[];
}

function groupClientScoped(): CategoryGroup[] {
  const order: NotificationCategory[] = [
    'content_calendar',
    'editing',
    'reports',
    'onboarding',
    'system',
  ];
  const groups = new Map<NotificationCategory, NotificationDefinition[]>();
  for (const def of NOTIFICATION_REGISTRY) {
    if (!def.clientScoped) continue;
    const arr = groups.get(def.category) ?? [];
    arr.push(def);
    groups.set(def.category, arr);
  }
  return order
    .filter((cat) => (groups.get(cat) ?? []).length > 0)
    .map((cat) => ({ category: cat, items: groups.get(cat) ?? [] }));
}
