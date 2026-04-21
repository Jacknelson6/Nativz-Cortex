import { redirect } from "next/navigation";

/**
 * `/admin/ad-creatives-v2` retired — Ad Creatives v2 was promoted to the
 * canonical `/admin/ad-creatives` URL (v1 hub retired). Redirect keeps
 * stale bookmarks / internal links working.
 */
export default function AdCreativesV2Redirect() {
  redirect("/admin/ad-creatives");
}
