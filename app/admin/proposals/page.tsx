import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy /admin/proposals roster — superseded by the unified
 * /admin/sales pipeline (spec: 2026-04-25-sales-pipeline-unification.md).
 *
 * Detail pages (/admin/proposals/[slug], /admin/proposals/new,
 * /admin/proposals/builder) stay live; only the flat list redirects.
 */
export default async function ProposalsIndex() {
  redirect('/admin/sales?status=sent');
}
