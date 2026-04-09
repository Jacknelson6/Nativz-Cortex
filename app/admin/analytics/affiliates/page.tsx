import { redirect } from 'next/navigation';

export default function AffiliatesAnalyticsPage() {
  redirect('/admin/analytics?tab=affiliates');
}
