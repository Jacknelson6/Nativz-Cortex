import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, FileText } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewProposalForm } from '@/components/admin/proposals/new-proposal-form';

export const dynamic = 'force-dynamic';

/**
 * /admin/proposals/new — entry point for new proposals.
 *
 * Two paths:
 *   - Chat-driven custom builder (recommended) — /admin/proposals/builder
 *   - Pick a fixed template (legacy) — this page
 *
 * The two coexist because some flows just need a known template (e.g.
 * the AC content-editing-packages page is well-defined). For everything
 * custom, the builder is the better surface.
 */
export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ flowId?: string; clientSlug?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  // `hide_from_roster` filter intentionally omitted: the column is gated
  // behind migration 054 and is missing on this snapshot. Applying the
  // filter makes PostgREST error and the picker renders empty, blocking
  // proposal creation entirely.
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .order('name');

  const preselectClientId = (() => {
    if (!sp.clientSlug) return null;
    const match = (clients ?? []).find((c) => c.slug === sp.clientSlug);
    return match?.id ?? null;
  })();

  const builderHref = (() => {
    const params = new URLSearchParams();
    if (sp.flowId) params.set('flowId', sp.flowId);
    if (sp.clientSlug) params.set('clientSlug', sp.clientSlug);
    const qs = params.toString();
    return `/admin/proposals/builder${qs ? `?${qs}` : ''}`;
  })();

  return (
    <div className="cortex-page-gutter max-w-4xl mx-auto space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · proposals
        </p>
        <h1 className="ui-page-title">New proposal</h1>
        <p className="text-sm text-text-muted">
          Build a custom proposal with the chat-driven builder or pick a fixed template.
        </p>
      </header>

      <Link
        href={builderHref}
        className="block rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition p-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-accent/15 text-accent-text flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">Chat-driven custom builder</h2>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                Recommended
              </span>
            </div>
            <p className="text-sm text-text-muted mt-1">
              Tag a client, add services from the catalog one at a time, iterate live with the agent + an inline
              preview, and commit when ready. Best for custom packages.
            </p>
          </div>
        </div>
      </Link>

      <details className="rounded-xl border border-nativz-border bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-text-primary flex items-center gap-2">
          <FileText size={14} className="text-text-muted" />
          Or pick a fixed template
        </summary>
        <div className="border-t border-nativz-border p-5">
          <NewProposalForm
            clients={(clients ?? []).map((c) => ({
              id: c.id,
              name: c.name ?? 'Unnamed',
              slug: c.slug ?? '',
            }))}
            preselectClientId={preselectClientId}
            flowId={sp.flowId ?? null}
          />
        </div>
      </details>
    </div>
  );
}
