'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Contact, Mail, Megaphone } from 'lucide-react';
import { BannersTab } from './banners-tab';
import { EmailsTab } from './emails-tab';
import { ContactsTab } from './contacts-tab';
import { SectionTabs, SectionHeader } from '@/components/admin/section-tabs';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export interface EmailHubClientOption {
  id: string;
  name: string;
  agency: string | null;
}

const NOTIFICATIONS_TABS = [
  { slug: 'banners',  label: 'Banners',  icon: <Megaphone size={13} /> },
  { slug: 'contacts', label: 'Contacts', icon: <Contact size={13} /> },
  { slug: 'emails',   label: 'Emails',   icon: <Mail size={13} /> },
] as const satisfies readonly SectionTabDef[];

type TabKey = (typeof NOTIFICATIONS_TABS)[number]['slug'];
const TAB_SLUGS: readonly TabKey[] = NOTIFICATIONS_TABS.map((t) => t.slug);

interface Props {
  clients: EmailHubClientOption[];
}

export function EmailHubClient(props: Props) {
  return (
    <Suspense fallback={<div className="cortex-page-gutter max-w-6xl mx-auto py-10 text-sm text-text-muted">Loading…</div>}>
      <EmailHubClientInner {...props} />
    </Suspense>
  );
}

function EmailHubClientInner({ clients }: Props) {
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = (TAB_SLUGS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'emails';

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="Notifications"
        description="Every email Cortex sends, plus in-app banners and contact lists — one feed for the whole hub."
      />

      <SectionTabs tabs={NOTIFICATIONS_TABS} active={tab} memoryKey="cortex:notifications:last-tab" />

      <div>
        {tab === 'banners' && <BannersTab clients={clients} />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'emails' && <EmailsTab />}
      </div>
    </div>
  );
}
