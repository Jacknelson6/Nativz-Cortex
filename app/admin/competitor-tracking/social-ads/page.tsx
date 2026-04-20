import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowRight, Megaphone, Facebook, Search, Target } from 'lucide-react';

export default async function SocialAdsScopePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface text-accent-text">
          <Megaphone size={18} aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Social ads</h1>
          <p className="text-sm text-text-secondary">
            Paid-social competitor tracking — Meta, TikTok, and Google Ads Library.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-nativz-border bg-surface p-6 shadow-card">
        <div className="mb-5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent-text">
            Scoping
          </span>
          <span className="text-xs text-text-muted">
            Next up after organic benchmarking lands
          </span>
        </div>

        <h2 className="mb-3 text-lg font-semibold text-text-primary">What's shipping here</h2>
        <ul className="mb-6 space-y-2 text-sm text-text-secondary">
          <li className="flex gap-2">
            <Facebook size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            <span>
              <strong className="text-text-primary">Meta Ad Library</strong> — paste a page URL,
              pull every active creative, tag by format (reel, static, carousel), and snapshot weekly.
            </span>
          </li>
          <li className="flex gap-2">
            <Target size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            <span>
              <strong className="text-text-primary">TikTok Ads Library</strong> — match TikTok Shop
              competitors already surfaced in TikTok Shop discovery.
            </span>
          </li>
          <li className="flex gap-2">
            <Search size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            <span>
              <strong className="text-text-primary">Google Ads transparency center</strong> — SERP +
              Shopping creatives for the same tracked brands.
            </span>
          </li>
        </ul>

        <div className="mb-6 rounded-xl border border-nativz-border/60 bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Already live today
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            Organic social competitors (TikTok / IG / YouTube / Facebook) are fully tracked with
            weekly snapshots in <strong className="text-text-primary">Analytics → Benchmarking</strong>.
            Meta creative extraction already runs on Prospect audits — we'll graduate that pipeline
            into a first-class benchmarking tab once social ads data model lands.
          </p>
          <Link
            href="/admin/analytics?tab=benchmarking"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:text-accent"
          >
            Open benchmarking
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <p className="text-xs text-text-muted">
          Tracked in Linear as part of the Competitor Spying v2 scope.
        </p>
      </div>
    </div>
  );
}
