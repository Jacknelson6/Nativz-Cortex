import { AffiliatesDashboard } from '@/components/affiliates/affiliates-dashboard';

export default function AffiliatesAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
        <p className="text-sm text-text-muted mt-0.5">Affiliate program performance</p>
      </div>
      <AffiliatesDashboard />
    </div>
  );
}
