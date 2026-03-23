'use client';

import { useEffect, useState } from 'react';
import { Loader2, LayoutGrid, Save, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import {
  ADMIN_WORKSPACE_TOGGLE_KEYS,
  ADMIN_WORKSPACE_TOGGLE_META,
  normalizeAdminWorkspaceModules,
  type AdminWorkspaceToggleKey,
} from '@/lib/clients/admin-workspace-modules';
import {
  buildPortalFeatureFlags,
  PORTAL_FEATURE_FLAG_DEFAULTS,
  type FeatureFlags,
} from '@/lib/portal/feature-flags';

const CONTRACT_SERVICES = ['SMM', 'Paid Media', 'Editing', 'Affiliates'] as const;

type ClientAccessPayload = {
  id: string;
  name: string;
  services: string[] | null;
  admin_workspace_modules?: Record<AdminWorkspaceToggleKey, boolean> | null;
  feature_flags: unknown;
};

/**
 * Contracted services, admin workspace access, portal feature flags, and API access — one save.
 */
export function ClientAccessServicesPanel({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientAccessPayload | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [modules, setModules] = useState<Record<AdminWorkspaceToggleKey, boolean> | null>(null);
  const [flags, setFlags] = useState<FeatureFlags>(PORTAL_FEATURE_FLAG_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: ClientAccessPayload };
        if (cancelled) return;
        const c = d.client;
        setClient(c);
        setServices(Array.isArray(c.services) ? [...c.services] : []);
        setModules(normalizeAdminWorkspaceModules(c.admin_workspace_modules));
        setFlags(buildPortalFeatureFlags(c.feature_flags));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  const baseline = client;
  const dirty =
    !!baseline &&
    !!modules &&
    (JSON.stringify([...services].sort()) !== JSON.stringify([...(baseline.services ?? [])].sort()) ||
      JSON.stringify(modules) !==
        JSON.stringify(normalizeAdminWorkspaceModules(baseline.admin_workspace_modules)) ||
      JSON.stringify(flags) !== JSON.stringify(buildPortalFeatureFlags(baseline.feature_flags)));

  async function saveAll() {
    if (!client || !modules) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services,
          admin_workspace_modules: modules,
          feature_flags: flags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || 'Failed to save');
        return;
      }
      toast.success('Access & services saved');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function setFlag<K extends keyof FeatureFlags>(key: K, value: boolean) {
    setFlags((prev) => ({ ...prev, [key]: value }));
  }

  if (error) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !client || !modules) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Briefcase size={16} className="text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Access & services</h2>
      </div>
      <p className="text-sm text-text-muted mb-6">
        Contracted services, then a single place to control Nativz team workspace areas and client portal capabilities
        (including REST API keys).
      </p>

      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-2">Contracted services</h3>
          <p className="text-xs text-text-muted mb-3">
            Used for internal workflows (e.g. affiliate analytics, Monday). Not the same as workspace or portal access below.
          </p>
          <div className="flex flex-wrap gap-2">
            {CONTRACT_SERVICES.map((svc) => {
              const active = services.includes(svc);
              return (
                <button
                  key={svc}
                  type="button"
                  onClick={() =>
                    setServices((prev) => (active ? prev.filter((s) => s !== svc) : [...prev, svc]))
                  }
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-accent/15 text-accent-text border border-accent/30'
                      : 'bg-surface-hover text-text-muted border border-nativz-border hover:border-nativz-border-light hover:text-text-secondary'
                  }`}
                >
                  {svc}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-nativz-border pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid size={16} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-primary">Workspace & portal access</h3>
          </div>
          <p className="text-xs text-text-muted mb-2">
            Same switch pattern for both: team toggles control the admin client workspace (nav + pages; off means hidden
            and direct URLs return not found). Portal toggles control what client users see. Overview and settings stay
            available to your team.
          </p>

          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted pt-2">
            Nativz team — admin workspace
          </p>
          <div className="space-y-4">
            {ADMIN_WORKSPACE_TOGGLE_KEYS.map((key) => {
              const meta = ADMIN_WORKSPACE_TOGGLE_META[key];
              return (
                <Toggle
                  key={key}
                  checked={modules[key]}
                  onChange={(v) => setModules((prev) => (prev ? { ...prev, [key]: v } : prev))}
                  label={meta.label}
                  description={meta.description}
                />
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] pt-6 mt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-3">
              Client portal
            </p>
            <div className="space-y-4">
              <Toggle
                checked={flags.can_search}
                onChange={(v) => setFlag('can_search', v)}
                label="Research & topic search"
                description="New searches and research flows in the portal"
              />
              <Toggle
                checked={flags.can_view_reports}
                onChange={(v) => setFlag('can_view_reports', v)}
                label="Approved reports"
                description="Reporting area in the portal"
              />
              <Toggle
                checked={flags.can_edit_preferences}
                onChange={(v) => setFlag('can_edit_preferences', v)}
                label="Brand preferences"
                description="Let portal users edit tone, topics, and seasonal priorities"
              />
              <Toggle
                checked={flags.can_submit_ideas}
                onChange={(v) => setFlag('can_submit_ideas', v)}
                label="Ideas hub"
                description="Submit and view content ideas"
              />
              <Toggle
                checked={flags.can_view_notifications}
                onChange={(v) => setFlag('can_view_notifications', v)}
                label="Notifications"
                description="In-app notifications page"
              />
              <Toggle
                checked={flags.can_view_calendar}
                onChange={(v) => setFlag('can_view_calendar', v)}
                label="Calendar"
                description="Content calendar in the portal"
              />
              <Toggle
                checked={flags.can_view_analyze}
                onChange={(v) => setFlag('can_view_analyze', v)}
                label="Analyze"
                description="Analyze tools in the portal"
              />
              <Toggle
                checked={flags.can_view_knowledge}
                onChange={(v) => setFlag('can_view_knowledge', v)}
                label="Knowledge"
                description="Knowledge base access"
              />
              <Toggle
                checked={flags.can_use_nerd}
                onChange={(v) => setFlag('can_use_nerd', v)}
                label="The Nerd"
                description="AI assistant in the portal"
              />
              <Toggle
                checked={flags.can_use_api}
                onChange={(v) => setFlag('can_use_api', v)}
                label="REST API keys"
                description="Allow portal users to create and use Bearer tokens for /api/v1 (automation integrations)"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-nativz-border">
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={saveAll}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save access & services'}
        </Button>
      </div>
    </Card>
  );
}
