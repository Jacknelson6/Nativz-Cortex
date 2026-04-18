import { cookies } from 'next/headers';
import { PasswordChangeForm } from '@/components/portal/password-change-form';
import { PortalSettingsForm } from '@/components/portal/portal-settings-form';
import { SidebarPreferencesSection } from '@/components/settings/sidebar-preferences';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageError } from '@/components/shared/page-error';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function PortalSettingsPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const adminClient = createAdminClient();

    // Hide the Account / Password cards when an admin is impersonating a
    // client — those fields would show the admin's own login data, which is
    // confusing next to a brand profile that belongs to the impersonated
    // client. Real viewers still see the full settings page.
    const cookieStore = await cookies();
    const isImpersonating = Boolean(cookieStore.get('x-impersonate-org')?.value);

    // Always re-read the client row by its resolved id so the brand profile
    // matches whatever getPortalClient() returned (impersonation-aware).
    const [{ data: userData }, { data: clientDetails }] = await Promise.all([
      adminClient
        .from('users')
        .select('full_name, email')
        .eq('id', user.id)
        .single(),
      adminClient
        .from('clients')
        .select('name, industry, target_audience, brand_voice, topic_keywords')
        .eq('id', client.id)
        .single(),
    ]);

    return (
      <div className="cortex-page-gutter space-y-6 max-w-2xl mx-auto">
        <h1 className="ui-page-title-md">Settings</h1>

        <PortalSettingsForm
          userId={user.id}
          initialName={userData?.full_name || ''}
          initialEmail={userData?.email || user.email || ''}
          clientId={client.id}
          companyName={clientDetails?.name || client.name || ''}
          initialIndustry={clientDetails?.industry || ''}
          initialTargetAudience={clientDetails?.target_audience || ''}
          initialBrandVoice={clientDetails?.brand_voice || ''}
          initialTopicKeywords={(clientDetails?.topic_keywords as string[]) || []}
          hideAccountCard={isImpersonating}
        />

        {!isImpersonating && (
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Password</h2>
            <p className="text-sm text-text-muted mb-4">
              Choose a strong password you don&apos;t use elsewhere.
            </p>
            <PasswordChangeForm />
          </Card>
        )}

        <div>
          <h2 className="text-base font-semibold text-text-primary mb-4">Sidebar</h2>
          <SidebarPreferencesSection role="viewer" />
        </div>
      </div>
    );
  } catch (error) {
    console.error('PortalSettingsPage error:', error);
    return <PageError />;
  }
}
