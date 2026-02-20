import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function PortalSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const adminClient = createAdminClient();

  const { data: userData } = await adminClient
    .from('users')
    .select('full_name, email, organization_id')
    .eq('id', user.id)
    .single();

  const { data: clients } = await adminClient
    .from('clients')
    .select('name, industry, target_audience, brand_voice, topic_keywords, feature_flags')
    .eq('organization_id', userData?.organization_id)
    .eq('is_active', true);

  const client = clients?.[0] as {
    name: string;
    industry: string;
    target_audience: string | null;
    brand_voice: string | null;
    topic_keywords: string[] | null;
    feature_flags: { can_search: boolean; can_view_reports: boolean; can_edit_preferences: boolean; can_submit_ideas: boolean } | null;
  } | undefined;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>

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

      {/* Brand info */}
      {client && (
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Brand profile</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-text-muted">Company</p>
              <p className="text-sm font-medium text-text-primary">{client.name}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Industry</p>
              <p className="text-sm font-medium text-text-primary">{client.industry}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Target audience</p>
              <p className="text-sm font-medium text-text-primary">{client.target_audience || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Brand voice</p>
              <p className="text-sm font-medium text-text-primary">{client.brand_voice || 'Not set'}</p>
            </div>
            {client.topic_keywords && client.topic_keywords.length > 0 && (
              <div>
                <p className="text-sm text-text-muted mb-1">Topic keywords</p>
                <div className="flex flex-wrap gap-1">
                  {client.topic_keywords.map((kw) => (
                    <Badge key={kw}>{kw}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Feature access */}
      {client?.feature_flags && (
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Feature access</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Topic search</span>
              <Badge variant={client.feature_flags.can_search ? 'success' : 'default'}>
                {client.feature_flags.can_search ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">View reports</span>
              <Badge variant={client.feature_flags.can_view_reports ? 'success' : 'default'}>
                {client.feature_flags.can_view_reports ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Edit preferences</span>
              <Badge variant={client.feature_flags.can_edit_preferences ? 'success' : 'default'}>
                {client.feature_flags.can_edit_preferences ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Submit ideas</span>
              <Badge variant={client.feature_flags.can_submit_ideas ? 'success' : 'default'}>
                {client.feature_flags.can_submit_ideas ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Contact your Nativz team to change feature access.
          </p>
        </Card>
      )}
    </div>
  );
}
