import { Users2 } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileTeamPage() {
  return (
    <ProfileStub
      icon={Users2}
      title="Team"
      subtitle="Strategist + editor assigned to this brand."
      note="Default strategist + default editor pickers, with editor attribution surfaced for the deliverables pipeline."
    />
  );
}
