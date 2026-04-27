import { redirect } from 'next/navigation';

/**
 * `/admin/competitor-tracking/social-ads` was the original lumped route
 * name before Competitor Spying was split per-platform. Redirect to Meta
 * Ads since that was the primary surface under "social-ads"; callers who
 * wanted Ecom can jump sideways via the sidebar dropdown.
 */
export default function SocialAdsRedirect() {
  redirect('/admin/competitor-tracking/meta-ads');
}
