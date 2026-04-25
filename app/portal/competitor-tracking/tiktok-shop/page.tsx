import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { PORTAL_HOME_PATH } from '@/lib/portal/client-surface';

export default async function PortalTikTokShopPage() {
  const portal = await getPortalClient();
  if (!portal) redirect('/login');

  // Gate: if the brand doesn't have TikTok Shop enabled, bounce home.
  // Direct-URL users hit the sidebar's grayed-out path; this is just
  // defense-in-depth in case the flag was flipped off mid-session.
  if (!portal.client.feature_flags.can_view_tiktok_shop) {
    redirect(PORTAL_HOME_PATH);
  }

  const admin = createAdminClient();
  const { data: searches } = await admin
    .from('tiktok_shop_searches')
    .select('id, query, status, products_found, creators_found, created_at, completed_at')
    .eq('client_id', portal.client.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-nativz-border bg-surface/40 px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
            <ShoppingBag size={20} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              TikTok Shop creators
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Research Nativz has run on TikTok Shop categories for your brand.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-4xl">
          {(searches?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-nativz-border bg-surface/30 p-10 text-center">
              <p className="text-sm text-text-muted">
                No searches yet. Ask your team to run a TikTok Shop category search for you.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {(searches ?? []).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/portal/competitor-tracking/tiktok-shop/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface px-4 py-3 transition hover:border-accent/40 hover:bg-surface-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{s.query}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {new Date(s.created_at).toLocaleDateString()} · {s.products_found} products · {s.creators_found} creators
                      </p>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
