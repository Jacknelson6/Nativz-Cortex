import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, ScanEye, Sparkles } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { SelfAuditForm } from '@/components/spying/self-audit-form';
import { SelfAuditHistoryList } from '@/components/spying/self-audit-history-list';
import type { BrandAuditRow } from '@/lib/brand-audits/types';

export const dynamic = 'force-dynamic';

export default async function SelfAuditIndexPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Role check + active brand are independent — fan them out so the auth
  // chain doesn't compound a roundtrip onto the brand lookup.
  const [meRes, activeBrandRes] = await Promise.all([
    admin
      .from('users')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single(),
    getActiveBrand(),
  ]);
  const me = meRes.data;
  if (me?.role !== 'admin' && me?.role !== 'super_admin' && !me?.is_super_admin) {
    redirect('/finder/new');
  }

  const { brand } = activeBrandRes;

  let listQuery = admin
    .from('brand_audits')
    .select(
      'id, brand_name, category, status, visibility_score, sentiment_score, sentiment_breakdown, models, prompts, created_at, completed_at, attached_client:attached_client_id(name)',
    )
    .order('created_at', { ascending: false })
    .limit(20);
  if (brand) listQuery = listQuery.eq('attached_client_id', brand.id);

  const { data: rows } = await listQuery;

  const audits = (rows ?? []).map((r) => {
    const attached = Array.isArray(r.attached_client) ? r.attached_client[0] : r.attached_client;
    return {
      id: r.id as string,
      brand_name: r.brand_name as string,
      category: r.category as string | null,
      status: r.status as BrandAuditRow['status'],
      visibility_score: r.visibility_score as number | null,
      sentiment_score: r.sentiment_score as number | null,
      sentiment_breakdown: (r.sentiment_breakdown as BrandAuditRow['sentiment_breakdown']) ?? {
        positive: 0,
        neutral: 0,
        negative: 0,
        not_mentioned: 0,
      },
      models: (r.models as string[]) ?? [],
      prompt_count: ((r.prompts as unknown[]) ?? []).length,
      created_at: r.created_at as string,
      completed_at: r.completed_at as string | null,
      attached_client_name: attached?.name ?? null,
    };
  });

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <header
        className="animate-ci-rise flex flex-wrap items-end justify-between gap-4"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <p className="ui-eyebrow text-accent-text/80">Mode · Self-audit</p>
          <h1 className="ui-page-title mt-1">How do AI models describe you?</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Asks Claude, GPT, and Gemini what they say about a brand, then rolls up
            visibility, sentiment, and the sources they cite. The AEO mirror of an
            audit — useful before a press push or a positioning rewrite.
          </p>
        </div>
        <Link
          href="/spying/audits"
          className="group inline-flex min-h-9 items-center gap-2 rounded-full border border-nativz-border bg-surface/70 px-4 py-2 text-[13px] text-text-secondary transition-colors hover:border-accent/40 hover:text-accent-text"
        >
          <ScanEye size={13} />
          Social audit instead
          <ArrowUpRight size={12} className="opacity-60 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      <section
        className="animate-ci-rise"
        style={{ animationDelay: '120ms' }}
      >
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2 text-xs text-text-muted">
            <Sparkles size={14} className="text-accent-text" />
            <span>Run takes ~30–60 seconds. We&apos;ll show you the results when it&apos;s done.</span>
          </div>
          <SelfAuditForm
            initialBrandName={brand?.name ?? ''}
            attachedClientId={brand?.id ?? null}
          />
        </div>
      </section>

      <section
        className="animate-ci-rise space-y-3"
        style={{ animationDelay: '240ms' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="ui-eyebrow text-accent-text/80">History</p>
            <h2 className="mt-1 font-display text-base font-semibold text-text-primary">
              Recent self-audits
            </h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {audits.length} {audits.length === 1 ? 'run' : 'runs'}
          </span>
        </div>
        <SelfAuditHistoryList audits={audits} />
      </section>
    </div>
  );
}
