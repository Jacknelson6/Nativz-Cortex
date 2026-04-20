import { ContactsSettingsView } from '@/components/clients/settings/contacts-settings-view';

export default async function ClientSettingsContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ContactsSettingsView slug={slug} />;
}
