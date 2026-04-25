import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DraftPreview } from '@/components/proposals/draft-preview';

export const dynamic = 'force-dynamic';

/**
 * /admin/proposals/draft/[id]/preview — server-rendered preview of an
 * in-progress chat draft. The Builder UI iframes this route so every
 * tool call (add line, apply rule, drop image) reflects on the right pane.
 *
 * Admin-only via RLS on proposal_drafts. Skips Cortex chrome so the
 * iframe focuses on content only.
 */
export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) notFound();

  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('*, clients(name, slug, logo_url, agency)')
    .eq('id', id)
    .maybeSingle();
  if (!draft) notFound();

  return <DraftPreview draft={draft as never} />;
}
