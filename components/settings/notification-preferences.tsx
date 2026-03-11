'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { NotificationPreferences } from '@/lib/types/notification-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

// ─── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
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

// ─── Threshold row ──────────────────────────────────────────────────────────

function ThresholdRow({
  label,
  description,
  enabled,
  onToggle,
  value,
  onValueChange,
  suffix,
  min,
  step,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: number;
  onValueChange: (v: number) => void;
  suffix: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div className="flex items-center gap-2 pl-1">
          <span className="text-xs text-text-muted">Trigger at</span>
          <input
            type="number"
            min={min ?? 1}
            step={step ?? 1}
            value={value}
            onChange={(e) => onValueChange(Number(e.target.value))}
            className="w-24 rounded-lg border border-nativz-border bg-surface-elevated px-2.5 py-1.5 text-sm text-text-primary focus:border-accent-border focus:outline-none"
          />
          <span className="text-xs text-text-muted">{suffix}</span>
        </div>
      )}
    </div>
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
            <Toggle checked={prefs.inApp} onChange={(v) => update({ inApp: v })} />
          </div>
          <div className="border-t border-nativz-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Email notifications</p>
              <p className="text-xs text-text-muted">Receive email alerts for important events</p>
            </div>
            <Toggle checked={prefs.email} onChange={(v) => update({ email: v })} />
          </div>
        </div>
      </Card>

      {/* Analytics alert thresholds */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Analytics alerts</h3>
        <div className="space-y-5">
          <ThresholdRow
            label="Engagement outliers"
            description="When a post exceeds a multiple of the client's average engagement"
            enabled={prefs.engagementOutlier.enabled}
            onToggle={(v) => update({ engagementOutlier: { ...prefs.engagementOutlier, enabled: v } })}
            value={prefs.engagementOutlier.threshold}
            onValueChange={(v) => update({ engagementOutlier: { ...prefs.engagementOutlier, threshold: v } })}
            suffix="x average"
            min={1.5}
            step={0.5}
          />

          <div className="border-t border-nativz-border" />

          <ThresholdRow
            label="Engagement spikes"
            description="When daily engagement jumps above the 7-day average"
            enabled={prefs.engagementSpike.enabled}
            onToggle={(v) => update({ engagementSpike: { ...prefs.engagementSpike, enabled: v } })}
            value={prefs.engagementSpike.percentIncrease}
            onValueChange={(v) => update({ engagementSpike: { ...prefs.engagementSpike, percentIncrease: v } })}
            suffix="% increase"
            min={10}
            step={10}
          />

          <div className="border-t border-nativz-border" />

          <ThresholdRow
            label="Follower milestones"
            description="When a client crosses a follower count milestone"
            enabled={prefs.followerMilestone.enabled}
            onToggle={(v) => update({ followerMilestone: { ...prefs.followerMilestone, enabled: v } })}
            value={prefs.followerMilestone.interval}
            onValueChange={(v) => update({ followerMilestone: { ...prefs.followerMilestone, interval: v } })}
            suffix="followers"
            min={100}
            step={1000}
          />

          <div className="border-t border-nativz-border" />

          <ThresholdRow
            label="Views threshold"
            description="When a single post exceeds a certain number of views"
            enabled={prefs.viewsThreshold.enabled}
            onToggle={(v) => update({ viewsThreshold: { ...prefs.viewsThreshold, enabled: v } })}
            value={prefs.viewsThreshold.minViews}
            onValueChange={(v) => update({ viewsThreshold: { ...prefs.viewsThreshold, minViews: v } })}
            suffix="views"
            min={100}
            step={1000}
          />

          <div className="border-t border-nativz-border" />

          <ThresholdRow
            label="Likes threshold"
            description="When a single post exceeds a certain number of likes"
            enabled={prefs.likesThreshold.enabled}
            onToggle={(v) => update({ likesThreshold: { ...prefs.likesThreshold, enabled: v } })}
            value={prefs.likesThreshold.minLikes}
            onValueChange={(v) => update({ likesThreshold: { ...prefs.likesThreshold, minLikes: v } })}
            suffix="likes"
            min={10}
            step={100}
          />

          <div className="border-t border-nativz-border" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Trending post detection</p>
                <p className="text-xs text-text-muted">When a post is picking up speed — checked hourly</p>
              </div>
              <Toggle
                checked={prefs.trendingPost?.enabled ?? true}
                onChange={(v) => update({ trendingPost: { ...prefs.trendingPost ?? { enabled: true, viewsPercentIncrease: 100, minViewGain: 500 }, enabled: v } })}
              />
            </div>
            {prefs.trendingPost?.enabled && (
              <div className="space-y-2 pl-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Views jump at least</span>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={prefs.trendingPost.viewsPercentIncrease}
                    onChange={(e) => update({ trendingPost: { ...prefs.trendingPost!, viewsPercentIncrease: Number(e.target.value) } })}
                    className="w-20 rounded-lg border border-nativz-border bg-surface-elevated px-2.5 py-1.5 text-sm text-text-primary focus:border-accent-border focus:outline-none"
                  />
                  <span className="text-xs text-text-muted">% per hour</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">With at least</span>
                  <input
                    type="number"
                    min={50}
                    step={100}
                    value={prefs.trendingPost.minViewGain}
                    onChange={(e) => update({ trendingPost: { ...prefs.trendingPost!, minViewGain: Number(e.target.value) } })}
                    className="w-24 rounded-lg border border-nativz-border bg-surface-elevated px-2.5 py-1.5 text-sm text-text-primary focus:border-accent-border focus:outline-none"
                  />
                  <span className="text-xs text-text-muted">new views</span>
                </div>
              </div>
            )}
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
