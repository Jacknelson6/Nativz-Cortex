import { Users } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileUsersPage() {
  return (
    <ProfileStub
      icon={Users}
      title="Users"
      subtitle="Contacts + portal access in one table with a role pill."
      note="Mobbin Users-table layout: avatar, name, email, role (Contact / Portal viewer / Primary), last active, invite controls."
    />
  );
}
