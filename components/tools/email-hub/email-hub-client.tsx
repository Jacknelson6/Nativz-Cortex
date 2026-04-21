'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Contact,
  FileText,
  FolderPlus,
  Mail,
  Megaphone,
  Settings,
  Zap,
} from 'lucide-react';
import { EmailsTab } from './emails-tab';
import { ContactsTab } from './contacts-tab';
import { TemplatesTab } from './templates-tab';
import { CampaignsTab } from './campaigns-tab';
import { ListsTab } from './lists-tab';
import { SequencesTab } from './sequences-tab';
import { SetupTab } from './setup-tab';

export interface EmailHubClientOption {
  id: string;
  name: string;
  agency: string | null;
}

type TabKey =
  | 'campaigns'
  | 'emails'
  | 'contacts'
  | 'lists'
  | 'templates'
  | 'sequences'
  | 'setup';

interface Tab {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'emails', label: 'Emails', icon: Mail },
  { key: 'contacts', label: 'Contacts', icon: Contact },
  { key: 'lists', label: 'Lists', icon: FolderPlus },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'sequences', label: 'Sequences', icon: Zap },
  { key: 'setup', label: 'Setup', icon: Settings },
];

interface Props {
  clients: EmailHubClientOption[];
}

export function EmailHubClient({ clients }: Props) {
  const [tab, setTab] = useState<TabKey>('campaigns');

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-surface border border-nativz-border">
          <Mail size={20} className="text-accent-text" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-xl font-semibold text-text-primary">Email Hub</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Manage campaigns, contacts, templates, sequences, and email settings.
          </p>
        </div>
      </header>

      <TabBar tabs={TABS} current={tab} onChange={setTab} />

      <div>
        {tab === 'campaigns' && <CampaignsTab clients={clients} />}
        {tab === 'emails' && <EmailsTab />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'lists' && <ListsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'sequences' && <SequencesTab />}
        {tab === 'setup' && <SetupTab />}
      </div>
    </div>
  );
}

function TabBar({
  tabs,
  current,
  onChange,
}: {
  tabs: Tab[];
  current: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div className="border-b border-nativz-border">
      <nav
        aria-label="Email Hub sections"
        className="flex gap-1 overflow-x-auto -mb-px"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = current === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                active
                  ? 'border-accent text-accent-text'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

