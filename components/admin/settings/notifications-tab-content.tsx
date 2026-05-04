'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, Contact, Mail, Megaphone } from 'lucide-react';
import { SectionTabs, SectionPanel } from '@/components/admin/section-tabs';
import type { SectionTabDef } from '@/components/admin/section-tabs';
import { BannersTab } from '@/components/tools/email-hub/banners-tab';
import { ContactsTab } from '@/components/tools/email-hub/contacts-tab';
import { EmailsTab } from '@/components/tools/email-hub/emails-tab';
import { NotificationsSection } from '@/components/settings/notifications-section';
import type { EmailHubClientOption } from '@/components/tools/email-hub/email-hub-client';
import type { NotificationRowProps } from '@/components/settings/notifications-section';

const NOTIFICATIONS_SUB_TABS = [
  { slug: 'registry', label: 'Registry', icon: <Bell size={13} /> },
  { slug: 'emails',   label: 'Emails',   icon: <Mail size={13} /> },
  { slug: 'banners',  label: 'Banners',  icon: <Megaphone size={13} /> },
  { slug: 'contacts', label: 'Contacts', icon: <Contact size={13} /> },
] as const satisfies readonly SectionTabDef[];

type SubTabKey = (typeof NOTIFICATIONS_SUB_TABS)[number]['slug'];
const SUB_TAB_SLUGS: readonly SubTabKey[] = NOTIFICATIONS_SUB_TABS.map((t) => t.slug);

interface Props {
  clients: EmailHubClientOption[];
  notifications: NotificationRowProps[];
}

export type NotificationsTabItem = NotificationRowProps;


export function NotificationsTabContent(props: Props) {
  return (
    <Suspense fallback={<div className="text-sm text-text-muted">Loading…</div>}>
      <NotificationsTabContentInner {...props} />
    </Suspense>
  );
}

function NotificationsTabContentInner({ clients, notifications }: Props) {
  const params = useSearchParams();
  const raw = params.get('sub');
  const sub: SubTabKey = (SUB_TAB_SLUGS as readonly string[]).includes(raw ?? '')
    ? (raw as SubTabKey)
    : 'registry';

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={NOTIFICATIONS_SUB_TABS}
        active={sub}
        memoryKey="cortex:settings:notifications:last-sub"
        paramKey="sub"
      />

      <div>
        {sub === 'registry' && (
          <SectionPanel
            title="Registry"
            description="Every automated email and chat ping Cortex sends. Toggle off, tune trigger windows, and preview each one for both brand modes."
          >
            <NotificationsSection notifications={notifications} />
          </SectionPanel>
        )}
        {sub === 'emails' && <EmailsTab />}
        {sub === 'banners' && <BannersTab clients={clients} />}
        {sub === 'contacts' && <ContactsTab />}
      </div>
    </div>
  );
}
