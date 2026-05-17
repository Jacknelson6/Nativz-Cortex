import { Coins } from 'lucide-react';
import { ProfileStub } from '@/components/clients/profile/profile-stub';

export const dynamic = 'force-dynamic';

export default function ProfileDeliverablesPage() {
  return (
    <ProfileStub
      icon={Coins}
      title="Deliverables"
      subtitle="Services, monthly output, posting defaults, plan tier."
      note="Mobbin Billing-plan layout. External product is &ldquo;deliverables / production capacity / monthly output&rdquo; — credits stay internal."
    />
  );
}
