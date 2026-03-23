'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plug, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConnectedAccounts } from '@/components/clients/connected-accounts';
import { PortalAccessCard, DangerZone } from '@/components/clients/client-settings-section';
import { SectionLabel } from '@/components/clients/client-profile-fields';

type ClientPayload = {
  id: string;
  name: string;
  feature_flags: {
    can_search?: boolean;
    can_view_reports?: boolean;
    can_edit_preferences?: boolean;
    can_submit_ideas?: boolean;
  } | null;
  is_active: boolean;
  uppromote_api_key?: string | null;
};

export function ClientSettingsSubpage({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientPayload | null>(null);

  const [canSearch, setCanSearch] = useState(true);
  const [canViewReports, setCanViewReports] = useState(true);
  const [canEditPreferences, setCanEditPreferences] = useState(false);
  const [canSubmitIdeas, setCanSubmitIdeas] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [savingFlags, setSavingFlags] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to load client');
        }
        const d = await res.json() as { client: ClientPayload };
        if (cancelled) return;
        const c = d.client;
        setClient(c);
        const f = c.feature_flags;
        setCanSearch(f?.can_search ?? true);
        setCanViewReports(f?.can_view_reports ?? true);
        setCanEditPreferences(f?.can_edit_preferences ?? false);
        setCanSubmitIdeas(f?.can_submit_ideas ?? false);
        setIsActive(c.is_active);
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
  }, [slug]);

  const f = client?.feature_flags;
  const flagsDirty =
    !!client &&
    (canSearch !== (f?.can_search ?? true) ||
      canViewReports !== (f?.can_view_reports ?? true) ||
      canEditPreferences !== (f?.can_edit_preferences ?? false) ||
      canSubmitIdeas !== (f?.can_submit_ideas ?? false));

  async function saveFeatureFlags() {
    if (!client) return;
    setSavingFlags(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_flags: {
            can_search: canSearch,
            can_view_reports: canViewReports,
            can_edit_preferences: canEditPreferences,
            can_submit_ideas: canSubmitIdeas,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save permissions');
        return;
      }
      toast.success('Portal permissions saved');
      setClient((prev) =>
        prev
          ? {
              ...prev,
              feature_flags: {
                can_search: canSearch,
                can_view_reports: canViewReports,
                can_edit_preferences: canEditPreferences,
                can_submit_ideas: canSubmitIdeas,
              },
            }
          : prev,
      );
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSavingFlags(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <div className="cortex-page-gutter max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="ui-page-title-md">Settings</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Portal access, integrations, and account controls for {client.name}.
        </p>
      </div>

      <SectionLabel icon={Plug} label="Integrations" />
      <ConnectedAccounts
        clientId={client.id}
        hasUpPromote={!!client.uppromote_api_key}
      />

      <SectionLabel icon={Settings2} label="Portal" />
      <PortalAccessCard
        clientId={client.id}
        canSearch={canSearch}
        setCanSearch={setCanSearch}
        canViewReports={canViewReports}
        setCanViewReports={setCanViewReports}
        canEditPreferences={canEditPreferences}
        setCanEditPreferences={setCanEditPreferences}
        canSubmitIdeas={canSubmitIdeas}
        setCanSubmitIdeas={setCanSubmitIdeas}
      />
      <div className="flex justify-end -mt-4">
        <Button
          type="button"
          size="sm"
          disabled={!flagsDirty || savingFlags}
          onClick={saveFeatureFlags}
        >
          <Save size={14} />
          {savingFlags ? 'Saving…' : 'Save portal permissions'}
        </Button>
      </div>

      <DangerZone
        clientId={client.id}
        clientName={client.name}
        isActive={isActive}
        setIsActive={setIsActive}
      />
    </div>
  );
}
