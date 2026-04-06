import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildPortalFeatureFlags } from '@/lib/portal/feature-flags';
import { PasswordChangeForm } from '@/components/portal/password-change-form';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageError } from '@/components/shared/page-error';

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
    const { data: userData } = await adminClient
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    // Get full client details for brand profile section
    const { data: clientDetails } = await adminClient
      .from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords, feature_flags, agency')
      .eq('id', client.id)
      .single();

    const featureAccess = clientDetails ? buildPortalFeatureFlags(clientDetails.feature_flags) : null;
    const agencyName = (clientDetails?.agency as string)?.toLowerCase().includes('anderson')
      ? 'Anderson Collaborative'
      : 'Nativz';

    return (
      <div className="cortex-page-gutter space-y-6 max-w-2xl mx-auto">
        <h1 className="ui-page-title-md">Settings</h1>

        {/* Account info */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Account</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-text-muted">Name</p>
              <p className="text-sm font-medium text-text-primary">{userData?.full_name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Email</p>
              <p className="text-sm font-medium text-text-primary">{userData?.email || user.email}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Password</h2>
          <p className="text-sm text-text-muted mb-4">
            Choose a strong password you don&apos;t use elsewhere.
          </p>
          <PasswordChangeForm />
        </Card>

        {/* Brand info — uses active brand from getPortalClient() */}
        {clientDetails && (
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Brand profile</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-text-muted">Company</p>
                <p className="text-sm font-medium text-text-primary">{clientDetails.name}</p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Industry</p>
                <p className="text-sm font-medium text-text-primary">{clientDetails.industry || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Target audience</p>
                <p className="text-sm font-medium text-text-primary">{clientDetails.target_audience || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Brand voice</p>
                <p className="text-sm font-medium text-text-primary">{clientDetails.brand_voice || 'Not set'}</p>
              </div>
              {clientDetails.topic_keywords && (clientDetails.topic_keywords as string[]).length > 0 && (
                <div>
                  <p className="text-sm text-text-muted mb-1">Topic keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {(clientDetails.topic_keywords as string[]).map((kw: string) => (
                      <Badge key={kw}>{kw}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Feature access */}
        {featureAccess && (
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Feature access</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Topic search</span>
                <Badge variant={featureAccess.can_search ? 'success' : 'default'}>
                  {featureAccess.can_search ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">View reports</span>
                <Badge variant={featureAccess.can_view_reports ? 'success' : 'default'}>
                  {featureAccess.can_view_reports ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Edit preferences</span>
                <Badge variant={featureAccess.can_edit_preferences ? 'success' : 'default'}>
                  {featureAccess.can_edit_preferences ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Submit ideas</span>
                <Badge variant={featureAccess.can_submit_ideas ? 'success' : 'default'}>
                  {featureAccess.can_submit_ideas ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">REST API</span>
                <Badge variant={featureAccess.can_use_api ? 'success' : 'default'}>
                  {featureAccess.can_use_api ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Contact your {agencyName} team to change feature access.
            </p>
          </Card>
        )}
      </div>
    );
  } catch (error) {
    console.error('PortalSettingsPage error:', error);
    return <PageError />;
  }
}
