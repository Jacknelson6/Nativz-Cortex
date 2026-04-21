import { redirect } from 'next/navigation';

/**
 * `/admin/competitor-tracking/social-ads` was the original lumped route
 * name before Competitor Spying was split per-platform (Meta Ads, Ecom,
 * TikTok Shop). Redirect to Meta Ads since that was the primary surface
 * under "social-ads"; callers who wanted Ecom or TikTok Shop will still
 * see the sidebar dropdown and can jump sideways.
 */
export default function SocialAdsRedirect() {
  redirect('/admin/competitor-tracking/meta-ads');
}
