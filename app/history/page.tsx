import { redirect } from 'next/navigation';

export default function LegacyHistoryPage() {
  redirect('/admin/search/history');
}
