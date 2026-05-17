import { Eye } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileOverviewPage() {
  return (
    <ProfileStub
      icon={Eye}
      title="Overview"
      subtitle="The single glance: who they are, what we ship, who&rsquo;s on the account."
      note="Read-only summary of every section, with hover-to-edit jumping straight to the editor field."
    />
  );
}
