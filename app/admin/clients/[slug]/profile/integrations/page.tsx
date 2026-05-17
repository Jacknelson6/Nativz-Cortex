import { Plug } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileIntegrationsPage() {
  return (
    <ProfileStub
      icon={Plug}
      title="Integrations"
      subtitle="Connected services + webhooks."
      note="Mobbin Integrations layout: Connected / Featured / Discover sections, plus an inline webhook card for revision + scheduler events."
    />
  );
}
