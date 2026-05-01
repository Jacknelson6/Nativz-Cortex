import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Source-of-truth resolver for "who should we email when something
 * happens for client X?" Anywhere in the app that sends notification
 * emails (calendar share, calendar followup, editing project share,
 * future ones) MUST go through this helper.
 *
 * Brand profile is the only source. POCs are managed exclusively on
 * the brand profile page; if a contact shouldn't be emailed, they
 * should be removed from the brand profile rather than disabled in a
 * separate "review contacts" override layer.
 */

export interface NotificationRecipient {
  email: string;
  name: string | null;
}

interface BrandContactRow {
  email: string | null;
  name: string | null;
}

export async function getClientNotificationRecipients(
  admin: SupabaseClient,
  clientId: string,
): Promise<NotificationRecipient[]> {
  const { data } = await admin
    .from('contacts')
    .select('email, name')
    .eq('client_id', clientId)
    .not('email', 'is', null)
    .returns<BrandContactRow[]>();

  return (data ?? [])
    .filter((c): c is { email: string; name: string | null } => !!c.email)
    .map((c) => ({ email: c.email, name: c.name }));
}
