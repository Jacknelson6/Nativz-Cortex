import { redirect } from 'next/navigation';

export default function LegacyHistoryPage() {
  redirect('/admin/search/new?history=true');
}
