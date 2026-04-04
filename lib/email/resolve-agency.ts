import type { AgencyBrand } from '@/lib/agency/detect';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export async function resolveAgencyFromHookPayload(
  payload: Record<string, unknown>,
): Promise<AgencyBrand> {
  // Check explicit agency in user_metadata
  const userMeta = payload.user_metadata as Record<string, unknown> | undefined;
  const agencyFromMeta = userMeta?.agency;
  if (agencyFromMeta === 'anderson' || agencyFromMeta === 'nativz') {
    return agencyFromMeta;
  }

  // Try to infer from email_address_change (email_change type sends new address here)
  const data = payload.data as Record<string, unknown> | undefined;
  const emailChange = data?.email_address_change as string | undefined;
  if (emailChange) {
    const hostname = emailChange.split('@')[1] ?? '';
    const detected = detectAgencyFromHostname(hostname);
    if (detected !== 'nativz') return detected;
  }

  // Fall back to main email domain
  const email = payload.email as string | undefined;
  if (email) {
    const hostname = email.split('@')[1] ?? '';
    const detected = detectAgencyFromHostname(hostname);
    if (detected !== 'nativz') return detected;
  }

  return 'nativz';
}
