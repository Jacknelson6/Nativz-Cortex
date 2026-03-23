import { ClientSettingsTabs } from '@/components/clients/client-settings-tabs';

export default async function ClientSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="cortex-page-gutter max-w-2xl mx-auto pb-12">
      <div className="mb-2">
        <h1 className="ui-page-title-md">Settings</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Configuration and notifications for this client workspace.
        </p>
      </div>
      <ClientSettingsTabs slug={slug} />
      {children}
    </div>
  );
}
