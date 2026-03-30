import { AnalyticsDashboard } from '@/components/reporting/analytics-dashboard';

export default async function SocialAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initial = clientId?.trim() || null;

  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <h1 className="ui-page-title">Analytics</h1>
        <p className="text-sm text-text-muted mt-0.5">Cross-platform social media performance</p>
      </div>
      <AnalyticsDashboard initialClientId={initial} />
    </div>
  );
}
