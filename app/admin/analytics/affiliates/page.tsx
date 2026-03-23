import { AffiliatesDashboard } from '@/components/affiliates/affiliates-dashboard';

export default function AffiliatesAnalyticsPage() {
  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <h1 className="ui-page-title">Analytics</h1>
        <p className="text-sm text-text-muted mt-0.5">Affiliate program performance</p>
      </div>
      <AffiliatesDashboard />
    </div>
  );
}
