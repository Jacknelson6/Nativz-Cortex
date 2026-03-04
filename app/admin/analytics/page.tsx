import { AnalyticsDashboard } from '@/components/reporting/analytics-dashboard';

export default function AdminAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
        <p className="text-sm text-text-muted mt-0.5">Cross-platform social media performance</p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
