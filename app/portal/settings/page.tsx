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
    feature_flags: { can_search: boolean; can_view_reports: boolean } | null;
  } | undefined;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      {/* Account info */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Name</p>
            <p className="text-sm font-medium text-gray-900">{userData?.full_name || 'Not set'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="text-sm font-medium text-gray-900">{userData?.email || user.email}</p>
          </div>
        </div>
      </Card>

      {/* Brand info */}
      {client && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Brand profile</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Company</p>
              <p className="text-sm font-medium text-gray-900">{client.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Industry</p>
              <p className="text-sm font-medium text-gray-900">{client.industry}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Target audience</p>
              <p className="text-sm font-medium text-gray-900">{client.target_audience || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Brand voice</p>
              <p className="text-sm font-medium text-gray-900">{client.brand_voice || 'Not set'}</p>
            </div>
            {client.topic_keywords && client.topic_keywords.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Topic keywords</p>
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
          <h2 className="text-base font-semibold text-gray-900 mb-4">Feature access</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Topic search</span>
              <Badge variant={client.feature_flags.can_search ? 'success' : 'default'}>
                {client.feature_flags.can_search ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">View reports</span>
              <Badge variant={client.feature_flags.can_view_reports ? 'success' : 'default'}>
                {client.feature_flags.can_view_reports ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Contact your Nativz team to change feature access.
          </p>
        </Card>
      )}
    </div>
  );
}
