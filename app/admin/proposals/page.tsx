import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader } from '@/components/admin/section-tabs';
import { formatCentsCompact } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const { data: proposals } = await admin
    .from('proposals')
    .select('id, slug, title, status, total_cents, currency, sent_at, signed_at, expires_at, client_id, clients(name, slug)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Proposals"
        description="Cortex-native proposal + package flow. Replaces ContractKit with inline-editable docs that link to Stripe deposits and trigger onboarding on sign. Scaffolded today — full editor + signing UI ships next."
        action={
          <button
            type="button"
            disabled
            title="Editor ships in the next revenue hub drop — see docs/superpowers/specs/2026-04-24-proposals-design.md"
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-muted"
          >
            <Plus size={12} /> New proposal (coming soon)
          </button>
        }
      />

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
        <p className="font-medium">Scaffold only.</p>
        <p className="mt-1 text-amber-200/80">
          Data model + table are live (<code>proposals</code>, <code>proposal_packages</code>,{' '}
          <code>proposal_deliverables</code>, <code>proposal_events</code>,{' '}
          <code>proposal_package_templates</code>). The editor, public signing page, Stripe
          Payment Link generation, and onboarding-on-sign trigger ship in a follow-up — see the
          design doc for the full surface.
        </p>
      </div>

      {proposals && proposals.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
                <th className="px-4 py-2.5 font-medium">Sent</th>
                <th className="px-4 py-2.5 font-medium">Signed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {proposals.map((p) => {
                const client = p.clients as { name?: string | null; slug?: string | null } | null;
                return (
                  <tr key={p.id} className="hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/proposals/${p.slug}`} className="text-text-primary hover:text-nz-cyan">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{client?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[11px] capitalize text-text-secondary">{p.status}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                      {p.total_cents != null ? formatCentsCompact(p.total_cents, p.currency) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {p.sent_at ? new Date(p.sent_at).toLocaleDateString('en-US') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {p.signed_at ? new Date(p.signed_at).toLocaleDateString('en-US') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
          <FileText size={18} className="mb-2 text-text-muted" />
          No proposals yet. When the editor ships, this page becomes the hub for building and
          sending them.
        </div>
      )}
    </div>
  );
}
