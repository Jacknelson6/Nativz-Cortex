import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock, FileText, MessageSquare, Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader } from '@/components/admin/section-tabs';

export const dynamic = 'force-dynamic';

const NERD_PROMPT = `Help me create a new proposal. Start by listing my proposal templates, then ask which client + signer + tier we're sending. When ready, call create_proposal.`;

const STATUS_PILL: Record<string, { label: string; classes: string; icon?: 'clock' | 'check' }> = {
  draft: { label: 'Draft', classes: 'bg-white/10 text-text-muted' },
  sent: { label: 'Sent', classes: 'bg-nz-cyan/10 text-nz-cyan', icon: 'clock' },
  viewed: { label: 'Viewed', classes: 'bg-indigo-500/10 text-indigo-200', icon: 'clock' },
  signed: { label: 'Signed', classes: 'bg-emerald-500/10 text-emerald-300', icon: 'check' },
  paid: { label: 'Paid', classes: 'bg-emerald-500/20 text-emerald-200', icon: 'check' },
  expired: { label: 'Expired', classes: 'bg-coral-500/10 text-coral-300' },
  canceled: { label: 'Canceled', classes: 'bg-coral-500/10 text-coral-300' },
};

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
      'id, slug, title, status, agency, sent_at, viewed_at, signed_at, paid_at, client_id, clients(name, slug)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = proposals ?? [];
  // Hide the Agency column when only one agency is in use (today: AC only).
  // Comes back automatically once a Nativz proposal lands.
  const agencies = new Set(rows.map((p) => p.agency).filter(Boolean));
  const showAgencyColumn = agencies.size > 1;

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Proposals"
        description="Pick a template, send the link, watch it sign + pay."
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/nerd?prompt=${encodeURIComponent(NERD_PROMPT)}`}
              className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/5"
            >
              <MessageSquare size={12} /> From chat
            </Link>
            <Link
              href="/admin/proposals/new"
              className="inline-flex items-center gap-1 rounded-full bg-nz-cyan px-3 py-1.5 text-xs font-semibold text-white hover:bg-nz-cyan/90"
            >
              <Plus size={12} /> New proposal
            </Link>
          </div>
        }
      />

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                {showAgencyColumn ? <th className="px-4 py-2.5 font-medium">Agency</th> : null}
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((p) => {
                const client = p.clients as { name?: string | null; slug?: string | null } | null;
                const lastActivity = p.paid_at ?? p.signed_at ?? p.viewed_at ?? p.sent_at ?? null;
                const lastLabel = p.paid_at
                  ? 'Paid'
                  : p.signed_at
                    ? 'Signed'
                    : p.viewed_at
                      ? 'Viewed'
                      : 'Sent';
                const pill = STATUS_PILL[p.status] ?? STATUS_PILL.draft;
                return (
                  <tr key={p.id} className="hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/proposals/${p.slug}`} className="text-text-primary hover:text-nz-cyan">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{client?.name ?? '—'}</td>
                    {showAgencyColumn ? (
                      <td className="px-4 py-2.5 text-[11px] text-text-muted">
                        {p.agency === 'anderson' ? 'AC' : p.agency === 'nativz' ? 'Nativz' : '—'}
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${pill.classes}`}
                      >
                        {pill.icon === 'clock' ? <Clock size={9} /> : null}
                        {pill.icon === 'check' ? <CheckCircle2 size={9} /> : null}
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {lastActivity
                        ? `${lastLabel} ${new Date(lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : '—'}
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
          No proposals yet. Click <strong>New proposal</strong> to pick a template and send one,
          or <strong>From chat</strong> to walk through it with Nerd.
        </div>
      )}
    </div>
  );
}
