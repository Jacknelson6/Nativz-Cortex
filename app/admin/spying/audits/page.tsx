import { redirect } from 'next/navigation';

export default function AuditsRedirect() {
  redirect('/admin/analyze-social');
}
