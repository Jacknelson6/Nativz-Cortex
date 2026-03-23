import { AnalyticsDashboard } from '@/components/reporting/analytics-dashboard';

export default function SocialAnalyticsPage() {
  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <h1 className="ui-page-title">Analytics</h1>
        <p className="text-sm text-text-muted mt-0.5">Cross-platform social media performance</p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
