'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Contact,
  FileText,
  FolderPlus,
  Mail,
  Megaphone,
  Send,
  Settings,
  Zap,
} from 'lucide-react';
import {
  ProductionUpdatesClient,
  type ClientOption,
  type UpdateRow,
} from '@/app/admin/tools/email/production-updates-client';
import { EmailsTab } from './emails-tab';
import { ContactsTab } from './contacts-tab';
import { TemplatesTab } from './templates-tab';

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
  clients: ClientOption[];
  initialUpdates: UpdateRow[];
  senderEmail: string | null;
}

export function EmailHubClient({ clients, initialUpdates, senderEmail }: Props) {
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
        {tab === 'campaigns' && (
          <CampaignsTab
            clients={clients}
            initialUpdates={initialUpdates}
            senderEmail={senderEmail}
          />
        )}
        {tab === 'emails' && <EmailsTab />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'lists' && (
          <EmptyTab
            icon={FolderPlus}
            title="Lists coming soon"
            description="Group recipients into reusable audiences you can target in campaigns and sequences."
          />
        )}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'sequences' && (
          <EmptyTab
            icon={Zap}
            title="Sequences coming soon"
            description="Multi-step drip flows triggered by events or joined lists."
          />
        )}
        {tab === 'setup' && (
          <EmptyTab
            icon={Settings}
            title="Setup coming soon"
            description="Sender identity, domain verification, and webhook routing will live here."
          />
        )}
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

function CampaignsTab({
  clients,
  initialUpdates,
  senderEmail,
}: {
  clients: ClientOption[];
  initialUpdates: UpdateRow[];
  senderEmail: string | null;
}) {
  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-nativz-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <Megaphone size={15} className="text-accent-text" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Campaigns</h2>
        </div>
      </header>
      <div className="p-5">
        {initialUpdates.length === 0 ? (
          <EmptyTab
            icon={Megaphone}
            title="No campaigns yet"
            description="Compose a production update below to broadcast what shipped to portal users."
          />
        ) : null}
        <ProductionUpdatesClient
          clients={clients}
          initialUpdates={initialUpdates}
          senderEmail={senderEmail}
        />
      </div>
    </section>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-nativz-border bg-surface/40 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
        <Icon size={22} className="text-accent-text" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-text-muted">{description}</p>
      </div>
      {cta}
    </div>
  );
}
