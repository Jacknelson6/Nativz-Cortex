import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader } from '@/components/admin/section-tabs';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
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

  const { data: proposals } = await admin
    .from('proposals')
    .select(
      'id, slug, title, status, agency, external_url, published_at, sent_at, viewed_at, signed_at, paid_at, client_id, clients(name, slug)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Proposals"
        description="Template-driven branded proposals. Pick a template, hit generate, and Cortex publishes a per-prospect folder to the docs repo, fires a branded email, and tracks sign + Stripe end-to-end."
        action={
          <Link
            href="/admin/proposals/new"
            className="inline-flex items-center gap-1 rounded-full bg-nz-cyan px-3 py-1.5 text-xs font-medium text-background hover:bg-nz-cyan/90"
          >
            <Plus size={12} /> New proposal
          </Link>
        }
      />

      {proposals && proposals.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Agency</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Sent</th>
                <th className="px-4 py-2.5 font-medium">Signed</th>
                <th className="px-4 py-2.5 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {proposals.map((p) => {
                const client = p.clients as { name?: string | null; slug?: string | null } | null;
                const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US') : '—');
                return (
                  <tr key={p.id} className="hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/proposals/${p.slug}`} className="text-text-primary hover:text-nz-cyan">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{client?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[11px] text-text-muted">
                      {p.agency === 'anderson' ? 'AC' : p.agency === 'nativz' ? 'Nativz' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] capitalize text-text-secondary">{p.status}</td>
                    <td className="px-4 py-2.5 text-text-muted">{d(p.sent_at)}</td>
                    <td className="px-4 py-2.5 text-text-muted">{d(p.signed_at)}</td>
                    <td className="px-4 py-2.5 text-text-muted">{d(p.paid_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
          <FileText size={18} className="mb-2 text-text-muted" />
          No proposals yet. Click <strong>New proposal</strong> to pick a template and send one.
        </div>
      )}
    </div>
  );
}
