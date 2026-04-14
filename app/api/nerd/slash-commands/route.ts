import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllCommands } from '@/lib/nerd/slash-commands';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nerd/slash-commands
 *
 * Returns the unified slash command list for the Nerd composer: the hardcoded
 * built-in commands from lib/nerd/slash-commands.ts plus any user-installed
 * skills from the nerd_skills table that have a command_slug set. The client
 * uses this to populate both the inline slash menu (typing "/") and the
 * Commands catalog popover in the chat header.
 *
 * Skill-based commands expose minimal metadata — the full content + prompt
 * template stays server-side and is applied when /<slug> is invoked through
 * the chat pipeline.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const builtins = getAllCommands().map((c) => ({
    name: c.name,
    description: c.description,
    type: c.type,
    example: c.example ?? null,
    source: 'builtin' as const,
  }));

  const admin = createAdminClient();
  const { data: skills } = await admin
    .from('nerd_skills')
    .select('name, description, command_slug, content, prompt_template')
    .eq('is_active', true)
    .not('command_slug', 'is', null)
    .order('name', { ascending: true });

  type SkillRow = {
    name: string;
    description: string | null;
    command_slug: string;
    content: string | null;
    prompt_template: string | null;
  };

  const skillCommands = (skills as SkillRow[] | null ?? []).map((s) => ({
    name: s.command_slug,
    description: s.description || s.name,
    type: 'ai' as const,
    example: `/${s.command_slug}`,
    source: 'skill' as const,
    // Client uses these for local expansion on submit. Keeping expansion
    // client-side means one fewer roundtrip and no server expand endpoint.
    skillContent: s.content ?? '',
    promptTemplate: s.prompt_template ?? null,
  }));

  return NextResponse.json({ commands: [...builtins, ...skillCommands] });
}
