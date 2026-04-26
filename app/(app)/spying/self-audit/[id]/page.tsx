import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SelfAuditDetail } from '@/components/spying/self-audit-detail';
import type { BrandAuditRow } from '@/lib/brand-audits/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SelfAuditDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin' && !me?.is_super_admin) {
    redirect('/finder/new');
  }

  const { data: row } = await admin
    .from('brand_audits')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!row) {
    redirect('/spying/self-audit');
  }

  const audit = normalizeAudit(row);

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <header
        className="animate-ci-rise flex flex-wrap items-end justify-between gap-4"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <Link
            href="/spying/self-audit"
            className="inline-flex items-center gap-1.5 text-[11px] text-text-muted transition-colors hover:text-accent-text"
          >
            <ArrowLeft size={11} />
            All self-audits
          </Link>
          <p className="ui-eyebrow mt-2 text-accent-text/80">Self-audit</p>
          <h1 className="ui-page-title mt-1">{audit.brand_name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            {audit.category ? `Category: ${audit.category}. ` : ''}
            Ran {audit.models.length} model{audit.models.length === 1 ? '' : 's'} ×{' '}
            {audit.prompts.length} prompt{audit.prompts.length === 1 ? '' : 's'} on{' '}
            {new Date(audit.created_at).toLocaleString()}.
          </p>
        </div>
      </header>

      <div className="animate-ci-rise" style={{ animationDelay: '120ms' }}>
        <SelfAuditDetail audit={audit} />
      </div>
    </div>
  );
}

function normalizeAudit(row: Record<string, unknown>): BrandAuditRow {
  return {
    id: row.id as string,
    attached_client_id: (row.attached_client_id as string | null) ?? null,
    brand_name: row.brand_name as string,
    category: (row.category as string | null) ?? null,
    status: row.status as BrandAuditRow['status'],
    prompts: (row.prompts as string[]) ?? [],
    models: (row.models as string[]) ?? [],
    responses: (row.responses as BrandAuditRow['responses']) ?? [],
    visibility_score: (row.visibility_score as number | null) ?? null,
    sentiment_score: (row.sentiment_score as number | null) ?? null,
    sentiment_breakdown: (row.sentiment_breakdown as BrandAuditRow['sentiment_breakdown']) ?? {
      positive: 0,
      neutral: 0,
      negative: 0,
      not_mentioned: 0,
    },
    top_sources: (row.top_sources as BrandAuditRow['top_sources']) ?? [],
    model_summary: (row.model_summary as BrandAuditRow['model_summary']) ?? [],
    error_message: (row.error_message as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
  };
}
