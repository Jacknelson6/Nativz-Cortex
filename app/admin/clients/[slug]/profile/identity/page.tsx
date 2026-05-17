import { IdCard } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileIdentityPage() {
  return (
    <ProfileStub
      icon={IdCard}
      title="Identity"
      subtitle="Name, website, industry, logo, voice, captions, products, aliases."
      note="Heaviest editor. Name + website + agency + industry + lifecycle + description sit at the top; voice, captions, products and aliases stack as sub-cards below."
    />
  );
}
