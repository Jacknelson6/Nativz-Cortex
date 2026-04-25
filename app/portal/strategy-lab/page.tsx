import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal/get-portal-client';

export const dynamic = 'force-dynamic';

/**
 * Bare /portal/strategy-lab path resolves to the user's bound client —
 * the deep link at /portal/strategy-lab/[clientId] is the canonical URL,
 * and anything else 404s in the [clientId] page below.
 */
export default async function PortalContentLabRedirect() {
  const portal = await getPortalClient();
  if (!portal) redirect('/login');
  redirect(`/portal/strategy-lab/${portal.client.id}`);
}
