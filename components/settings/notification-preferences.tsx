'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { NotificationPreferences } from '@/lib/types/notification-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

// ─── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30 ${
        checked ? 'bg-accent' : 'bg-surface-hover'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/notifications/preferences');
        if (res.ok) {
          const data = await res.json();
          setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...data });
        }
      } catch { /* use defaults */ } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const update = useCallback((patch: Partial<NotificationPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error();
      toast.success('Notification preferences saved');
      setDirty(false);
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Master toggles */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">In-app notifications</p>
              <p className="text-xs text-text-muted">Show notification bell alerts in Cortex</p>
            </div>
            <Toggle
              checked={prefs.inApp}
              onChange={(v) => update({ inApp: v })}
              label="Toggle in-app notifications"
            />
          </div>
          <div className="border-t border-nativz-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Email notifications</p>
              <p className="text-xs text-text-muted">Receive email alerts for important events</p>
            </div>
            <Toggle
              checked={prefs.email}
              onChange={(v) => update({ email: v })}
              label="Toggle email notifications"
            />
          </div>
        </div>
      </Card>

      {dirty && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
            Save preferences
          </Button>
        </div>
      )}
    </div>
  );
}
