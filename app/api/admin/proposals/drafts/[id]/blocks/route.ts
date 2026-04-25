import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CustomBlock } from '@/lib/proposals/draft-engine';

const AddBlockBody = z.object({
  kind: z.enum(['markdown', 'image']),
  content: z.string().min(1).max(20000),
  caption: z.string().max(200).optional(),
});

const PatchBlockBody = z.object({
  block_id: z.string().uuid(),
  content: z.string().max(20000).optional(),
  caption: z.string().max(200).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  remove: z.boolean().optional(),
});

async function adminCheck(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return me?.role === 'admin' || me?.is_super_admin === true;
}

/**
 * POST /api/admin/proposals/drafts/[id]/blocks — append a custom block.
 * Markdown blocks render as rich text inline; image blocks render as a
 * captioned figure. Image content should be a URL (the chat uploads
 * dropped images to Storage first and passes the public URL here).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: draftId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = AddBlockBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }

  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('id, custom_blocks')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });

  const existing = ((draft.custom_blocks as CustomBlock[]) ?? []);
  const block: CustomBlock = {
    id: randomUUID(),
    kind: parsed.data.kind,
    content: parsed.data.content,
    caption: parsed.data.caption,
    position: existing.length,
  };
  await admin.from('proposal_drafts').update({ custom_blocks: [...existing, block] }).eq('id', draftId);
  return NextResponse.json({ ok: true, block });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: draftId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = PatchBlockBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }

  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('id, custom_blocks')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });

  let blocks = ((draft.custom_blocks as CustomBlock[]) ?? []);
  if (parsed.data.remove) {
    blocks = blocks.filter((b) => b.id !== parsed.data.block_id);
    blocks.forEach((b, i) => { b.position = i; });
  } else {
    blocks = blocks.map((b) => {
      if (b.id !== parsed.data.block_id) return b;
      return {
        ...b,
        content: parsed.data.content ?? b.content,
        caption: parsed.data.caption === undefined ? b.caption : parsed.data.caption ?? undefined,
        position: parsed.data.position ?? b.position,
      };
    });
  }
  await admin.from('proposal_drafts').update({ custom_blocks: blocks }).eq('id', draftId);
  return NextResponse.json({ ok: true });
}
