import { Archive } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileAssetsPage() {
  return (
    <ProfileStub
      icon={Archive}
      title="Assets"
      subtitle="Footage, logos, guidelines, fonts, reference photos."
      note="Ports the existing Brand assets card (drag-drop uploader, signed downloads, onboarding-source badges) into the new rail."
    />
  );
}
