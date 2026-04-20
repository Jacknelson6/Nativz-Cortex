import { ClientSettingsShell } from '@/components/clients/settings/settings-shell';

export default async function ClientSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClientSettingsShell slug={slug}>{children}</ClientSettingsShell>;
}
