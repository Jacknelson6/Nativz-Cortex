import { Bell } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileNotificationsPage() {
  return (
    <ProfileStub
      icon={Bell}
      title="Notifications"
      subtitle="What we email this client, when, and from which sender."
      note="Mobbin Notifications layout: grouped toggle rows for affiliate digest, social digest, drop reminders, revision pings."
    />
  );
}
