import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncSkillFromGitHub, extractKeywords, invalidateSkillsCache } from '@/lib/nerd/skills-loader';

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, user: null };

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!userData?.is_super_admin) return { error: 'Forbidden', status: 403, user: null };
  return { error: null, status: 200, user };
}

/** GET /api/nerd/skills — list all skills */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data } = await admin
    .from('nerd_skills')
    .select('*')
    .order('created_at', { ascending: false });

  return NextResponse.json({ skills: data ?? [] });
}

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9-]{1,39}$/, 'Lowercase letters, digits, and dashes only — must start with a letter');

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  github_repo: z.string().min(3).max(200),
  github_path: z.string().max(500).default('SKILL.md'),
  github_branch: z.string().max(100).default('main'),
  keywords: z.array(z.string()).default([]),
  command_slug: slugSchema.optional().nullable(),
  prompt_template: z.string().max(2000).optional().nullable(),
});

/** POST /api/nerd/skills — create + sync from GitHub */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, description, github_repo, github_path, github_branch, keywords, command_slug, prompt_template } = parsed.data;

  // Fetch content from GitHub
  let content: string;
  try {
    content = await syncSkillFromGitHub(github_repo, github_path, github_branch);
  } catch (err) {
    return NextResponse.json({
      error: `Failed to fetch from GitHub: ${(err as Error).message}`,
    }, { status: 422 });
  }

  // Extract keywords from content + manual ones
  const allKeywords = extractKeywords(content, keywords);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('nerd_skills')
    .insert({
      name,
      description: description || content.slice(0, 200),
      github_repo,
      github_path,
      github_branch,
      content,
      keywords: allKeywords,
      command_slug: command_slug ?? null,
      prompt_template: prompt_template ?? null,
      last_synced_at: new Date().toISOString(),
      created_by: auth.user!.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A skill from this repo/path already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateSkillsCache();
  return NextResponse.json({ skill: data }, { status: 201 });
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  command_slug: slugSchema.optional().nullable(),
  prompt_template: z.string().max(2000).optional().nullable(),
  sync: z.boolean().optional(), // re-sync from GitHub
});

/** PATCH /api/nerd/skills — update a skill */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, sync, ...updates } = parsed.data;
  const admin = createAdminClient();

  // If sync requested, re-fetch from GitHub
  if (sync) {
    const { data: existing } = await admin
      .from('nerd_skills')
      .select('github_repo, github_path, github_branch')
      .eq('id', id)
      .single();

    if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

    try {
      const content = await syncSkillFromGitHub(existing.github_repo, existing.github_path, existing.github_branch);
      const keywords = extractKeywords(content, updates.keywords ?? []);
      Object.assign(updates, { content, keywords, last_synced_at: new Date().toISOString() });
    } catch (err) {
      return NextResponse.json({ error: `Sync failed: ${(err as Error).message}` }, { status: 422 });
    }
  }

  const { data, error } = await admin
    .from('nerd_skills')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateSkillsCache();
  return NextResponse.json({ skill: data });
}

/** DELETE /api/nerd/skills — remove a skill */
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('nerd_skills').delete().eq('id', id);

  invalidateSkillsCache();
  return NextResponse.json({ deleted: true });
}
