import { Lock, Palette } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { PreferencesForm } from '@/components/preferences/preferences-form';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import type { ClientPreferences } from '@/lib/types/database';

export default async function PortalPreferencesPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if (!client.feature_flags.can_edit_preferences) {
      return (
        <div className="p-6">
          <EmptyState
            icon={<Lock size={24} />}
            title="Preferences not enabled"
            description="Contact your Nativz team to enable brand preference editing."
          />
        </div>
      );
    }

    const prefs: ClientPreferences = client.preferences || {
      tone_keywords: [],
      topics_lean_into: [],
      topics_avoid: [],
      competitor_accounts: [],
      seasonal_priorities: [],
    };

    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <div>
          <div className="flex items-center gap-2.5">
            <Palette size={20} className="text-accent-text" />
            <h1 className="text-2xl font-semibold text-text-primary">Brand preferences</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Shape how your content ideas are generated. Update these anytime — they feed directly into your ideation pipeline.
          </p>
        </div>

        <PreferencesForm
          clientId={client.id}
          clientName={client.name}
          initialPreferences={prefs}
        />
      </div>
    );
  } catch (error) {
    console.error('PortalPreferencesPage error:', error);
    return <PageError />;
  }
}
