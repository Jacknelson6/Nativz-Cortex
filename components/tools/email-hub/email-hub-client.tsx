'use client';

import { useSearchParams } from 'next/navigation';
import { Contact, FileText, Mail, Megaphone, Settings } from 'lucide-react';
import { BannersTab } from './banners-tab';
import { EmailsTab } from './emails-tab';
import { ContactsTab } from './contacts-tab';
import { TemplatesTab } from './templates-tab';
import { SetupTab } from './setup-tab';
import { SectionTabs, SectionHeader } from '@/components/admin/section-tabs';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export interface EmailHubClientOption {
  id: string;
  name: string;
  agency: string | null;
}

const NOTIFICATIONS_TABS = [
  { slug: 'banners',   label: 'Banners',   icon: Megaphone },
  { slug: 'contacts',  label: 'Contacts',  icon: Contact },
  { slug: 'emails',    label: 'Emails',    icon: Mail },
  { slug: 'templates', label: 'Templates', icon: FileText },
  { slug: 'setup',     label: 'Setup',     icon: Settings },
] as const satisfies readonly SectionTabDef[];

type TabKey = (typeof NOTIFICATIONS_TABS)[number]['slug'];
const TAB_SLUGS: readonly TabKey[] = NOTIFICATIONS_TABS.map((t) => t.slug);

interface Props {
  clients: EmailHubClientOption[];
}

export function EmailHubClient({ clients }: Props) {
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = (TAB_SLUGS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'banners';

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="Notifications"
        description="In-app banners, outbound email, and sender configuration — all in one place. Pick a tab to drill in."
      />

      <SectionTabs tabs={NOTIFICATIONS_TABS} active={tab} memoryKey="cortex:notifications:last-tab" />

      <div>
        {tab === 'banners' && <BannersTab clients={clients} />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'emails' && <EmailsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'setup' && <SetupTab />}
      </div>
    </div>
  );
}
