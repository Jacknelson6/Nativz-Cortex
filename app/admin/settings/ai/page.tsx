import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AISettingsSkillsClient } from './skills-client';

export const dynamic = 'force-dynamic';

/**
 * Admin AI settings — skill management.
 *
 * Admin-only. Lists every row in `nerd_skills`, lets you toggle which
 * harnesses load each (admin Nerd / admin Content Lab / portal Content Lab),
 * edit the markdown body for upload-source skills, sync github-source ones,
 * and scope a skill to a single client. The chat route's
 * `buildDbSkillsContext` filters by harness + client at request time so the
 * portal never receives admin-only skill context unless explicitly shared.
 */
export default async function AISettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  return (
    <div className="cortex-page-gutter max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">AI skills</h1>
        <p className="mt-1 text-sm text-text-muted max-w-2xl">
          Markdown context loaded into the Nerd's system prompt. Each skill
          picks which harnesses it applies to — the admin Nerd, admin Content
          Lab, and/or the portal Content Lab — and can be scoped to a single
          client so brand-specific guidance only fires for that account.
        </p>
      </div>

      <AISettingsSkillsClient clients={clients ?? []} />
    </div>
  );
}
