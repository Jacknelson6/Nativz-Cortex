/**
 * Shared client option shape used by every email-hub sub-tab. The original
 * <EmailHubClient> wrapper was retired on 2026-05-03 when the hub was
 * absorbed into Settings — see `components/admin/settings/notifications-tab-content.tsx`
 * for the new home. Type stays here because banners-tab.tsx imports it.
 */
export interface EmailHubClientOption {
  id: string;
  name: string;
  agency: string | null;
}
