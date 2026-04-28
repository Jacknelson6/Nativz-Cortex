'use client';

/**
 * Notifications control center — one row per registered notification with a
 * kill-switch, parameter knobs (e.g. `windowHours` for reminder cadence), and
 * a preview button that renders the email in both Nativz + Anderson brands.
 *
 * Schedules are intentionally read-only (managed in vercel.json) since
 * Vercel cron is build-time. Disabling here causes the handler to no-op early
 * via `getNotificationSetting(key).enabled`.
 */

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Eye, Loader2, Mail, MessageSquare, Inbox } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { NotificationPreviewModal } from './notification-preview-modal';

interface NotificationParamSpec {
  label: string;
  description?: string;
  type: 'duration_hours' | 'duration_minutes' | 'string' | 'boolean' | 'email_list';
  default: number | string | boolean | string[];
  min?: number;
  max?: number;
}

export interface NotificationRowProps {
  key: string;
  label: string;
  description: string;
  kind: 'email' | 'chat' | 'in_app';
  trigger: 'cron' | 'event';
  cronSchedule?: string;
  recipientLabel: string;
  params: Record<string, NotificationParamSpec> | null;
  previewable: boolean;
}

interface SettingState {
  enabled: boolean;
  params: Record<string, number | string | boolean | string[]>;
  loading: boolean;
}

function kindIcon(kind: NotificationRowProps['kind']) {
  if (kind === 'chat') return <MessageSquare size={16} className="text-accent-text" />;
  if (kind === 'in_app') return <Inbox size={16} className="text-accent-text" />;
  return <Mail size={16} className="text-accent-text" />;
}

function describeCron(expr: string | undefined): string | null {
  if (!expr) return null;
  // Just expose the cron expression — admins who care can read it; non-admins
  // shouldn't be tuning it here anyway (it lives in vercel.json).
  return expr;
}

export function NotificationsSection({ notifications }: { notifications: NotificationRowProps[] }) {
  const [state, setState] = useState<Record<string, SettingState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  // Load current settings for every row in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, SettingState> = {};
      await Promise.all(
        notifications.map(async (n) => {
          try {
            const res = await fetch(`/api/admin/notifications/${n.key}`);
            if (!res.ok) throw new Error('load failed');
            const data = (await res.json()) as { enabled: boolean; params: SettingState['params'] };
            next[n.key] = { enabled: data.enabled, params: data.params, loading: false };
          } catch {
            next[n.key] = { enabled: true, params: {}, loading: false };
          }
        }),
      );
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [notifications]);

  return (
    <div className="space-y-3">
      {notifications.map((n) => {
        const s = state[n.key];
        const open = !!expanded[n.key];
        const hasParams = n.params && Object.keys(n.params).length > 0;

        return (
          <div
            key={n.key}
            className="rounded-xl border border-nativz-border bg-surface px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-surface">
                {kindIcon(n.kind)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-text-primary">{n.label}</h3>
                  <span className="rounded-md bg-nativz-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                    {n.trigger === 'cron' ? 'Scheduled' : 'Event'}
                  </span>
                  <span className="rounded-md bg-nativz-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                    {n.kind === 'in_app' ? 'In-app' : n.kind}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted">{n.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
                  <span>To: {n.recipientLabel}</span>
                  {n.cronSchedule && (
                    <span>
                      Schedule: <code className="text-text-secondary">{describeCron(n.cronSchedule)}</code>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {n.previewable && (
                  <button
                    type="button"
                    onClick={() => setPreviewKey(n.key)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-nativz-border bg-background px-2.5 text-xs text-text-secondary hover:bg-nativz-border/30"
                  >
                    <Eye size={13} /> Preview
                  </button>
                )}
                {hasParams && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [n.key]: !open }))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-nativz-border bg-background text-text-secondary hover:bg-nativz-border/30"
                    aria-label={open ? 'Collapse settings' : 'Expand settings'}
                  >
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <ToggleRow
                  notificationKey={n.key}
                  state={s}
                  onChange={(enabled) =>
                    setState((prev) => ({
                      ...prev,
                      [n.key]: { ...(prev[n.key] ?? { params: {}, loading: false, enabled: true }), enabled },
                    }))
                  }
                />
              </div>
            </div>

            {open && hasParams && s && (
              <div className="mt-3 grid gap-3 border-t border-nativz-border pt-3 sm:grid-cols-2">
                {Object.entries(n.params!).map(([paramKey, spec]) => (
                  <ParamField
                    key={paramKey}
                    notificationKey={n.key}
                    paramKey={paramKey}
                    spec={spec}
                    value={s.params[paramKey] ?? spec.default}
                    onChange={(v) =>
                      setState((prev) => ({
                        ...prev,
                        [n.key]: {
                          ...(prev[n.key] ?? { enabled: true, loading: false, params: {} }),
                          params: { ...(prev[n.key]?.params ?? {}), [paramKey]: v },
                        },
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {previewKey && (
        <NotificationPreviewModal
          notificationKey={previewKey}
          notificationLabel={notifications.find((n) => n.key === previewKey)?.label ?? previewKey}
          onClose={() => setPreviewKey(null)}
        />
      )}
    </div>
  );
}

function ToggleRow({
  notificationKey,
  state,
  onChange,
}: {
  notificationKey: string;
  state: SettingState | undefined;
  onChange: (enabled: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  if (!state) {
    return <Loader2 size={14} className="animate-spin text-text-muted" />;
  }
  return (
    <div className="flex items-center">
      <button
        type="button"
        role="switch"
        aria-checked={state.enabled}
        disabled={pending}
        onClick={() => {
          const next = !state.enabled;
          onChange(next);
          startTransition(async () => {
            try {
              const res = await fetch(`/api/admin/notifications/${notificationKey}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
              });
              if (!res.ok) throw new Error('save failed');
            } catch {
              onChange(!next);
              toast.error('Could not update setting');
            }
          });
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
          state.enabled ? 'bg-accent' : 'bg-nativz-border'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
            state.enabled ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function ParamField({
  notificationKey,
  paramKey,
  spec,
  value,
  onChange,
}: {
  notificationKey: string;
  paramKey: string;
  spec: NotificationParamSpec;
  value: number | string | boolean | string[];
  onChange: (v: number | string | boolean | string[]) => void;
}) {
  const [draft, setDraft] = useState<string>(() => formatValue(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(formatValue(value));
  }, [value]);

  async function commit(parsed: number | string | boolean | string[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/notifications/${notificationKey}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ params: { [paramKey]: parsed } }),
      });
      if (!res.ok) throw new Error('save failed');
      onChange(parsed);
    } catch {
      toast.error('Could not save change');
    } finally {
      setSaving(false);
    }
  }

  if (spec.type === 'duration_hours' || spec.type === 'duration_minutes') {
    const unit = spec.type === 'duration_hours' ? 'hours' : 'minutes';
    return (
      <label className="block">
        <span className="text-xs font-medium text-text-secondary">{spec.label}</span>
        {spec.description && <span className="block text-[11px] text-text-muted">{spec.description}</span>}
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            min={spec.min}
            max={spec.max}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = Number(draft);
              if (!Number.isFinite(n)) {
                setDraft(formatValue(value));
                return;
              }
              if (n === Number(value)) return;
              commit(n);
            }}
            className="h-9 w-24 rounded-md border border-nativz-border bg-background px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="text-xs text-text-muted">{unit}</span>
          {saving && <Loader2 size={12} className="animate-spin text-text-muted" />}
        </div>
      </label>
    );
  }

  if (spec.type === 'boolean') {
    return (
      <Toggle
        checked={Boolean(value)}
        onChange={(v) => commit(v)}
        label={spec.label}
        description={spec.description}
      />
    );
  }

  if (spec.type === 'email_list') {
    return (
      <label className="block sm:col-span-2">
        <span className="text-xs font-medium text-text-secondary">{spec.label}</span>
        {spec.description && <span className="block text-[11px] text-text-muted">{spec.description}</span>}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const arr = draft
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean);
            commit(arr);
          }}
          placeholder="alice@x.com, bob@y.com"
          className="mt-1.5 h-9 w-full rounded-md border border-nativz-border bg-background px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary">{spec.label}</span>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        className="mt-1.5 h-9 w-full rounded-md border border-nativz-border bg-background px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}

function formatValue(v: number | string | boolean | string[]): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}
