import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  parseChatCommand,
  CHAT_COMMAND_HELP,
  type AdChatCommand,
} from '@/lib/ad-creatives/chat-commands';

const bodySchema = z.object({
  clientId: z.string().uuid(),
  input: z.string().min(1).max(400),
});

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Runs a slash command against a client's concept set. Returns a summary
 * string the UI can render as the assistant turn, the updated concepts
 * (so the gallery can react), and the persisted messages.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { clientId, input } = parsed.data;

  const command = parseChatCommand(input);
  if (!command) {
    return NextResponse.json(
      {
        error: `Not a recognized command. ${CHAT_COMMAND_HELP}`,
      },
      { status: 400 },
    );
  }

  // Persist the user message first so the chat history shows the command
  // even if execution fails.
  await admin.from('ad_generator_messages').insert({
    client_id: clientId,
    role: 'user',
    content: input.trim(),
    command: command.kind,
    author_user_id: user.id,
  });

  const result = await executeCommand(admin, clientId, command);

  // Persist the assistant reply. metadata carries any structured info
  // the UI wants without re-parsing the summary string.
  const { data: assistantMsg } = await admin
    .from('ad_generator_messages')
    .insert({
      client_id: clientId,
      role: 'assistant',
      content: result.summary,
      command: command.kind,
      metadata: result.metadata,
      author_user_id: user.id,
    })
    .select('id, role, content, command, metadata, created_at')
    .single();

  return NextResponse.json({
    summary: result.summary,
    affectedConcepts: result.affectedConcepts,
    metadata: result.metadata,
    assistantMessageId: assistantMsg?.id ?? null,
  });
}

interface CommandResult {
  summary: string;
  affectedConcepts: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

async function executeCommand(
  admin: AdminClient,
  clientId: string,
  command: AdChatCommand,
): Promise<CommandResult> {
  if (command.kind === 'help') {
    return { summary: CHAT_COMMAND_HELP, affectedConcepts: [], metadata: {} };
  }

  if (command.kind === 'list') {
    const { data: counts } = await admin
      .from('ad_concepts')
      .select('status', { count: 'exact' })
      .eq('client_id', clientId);
    const statusCounts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const row of counts ?? []) {
      const s = (row.status as string) ?? 'pending';
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    return {
      summary: `Pending: ${statusCounts.pending ?? 0} · Approved: ${statusCounts.approved ?? 0} · Rejected: ${statusCounts.rejected ?? 0}`,
      affectedConcepts: [],
      metadata: { counts: statusCounts },
    };
  }

  if (command.kind === 'regen') {
    // Regen is a stub at the chat layer — it returns instructions since
    // actually rendering requires the image-generation call which lives
    // behind /api/ad-creatives/concepts/[id]/render. Phase 2c could
    // trigger it from here; for now we nudge the user to click the
    // per-card button so the async work has a clear UI anchor.
    return {
      summary: `Use the Render button on ${command.slug}'s card to kick off a new image. (Chat-triggered render lands in a follow-up push.)`,
      affectedConcepts: [],
      metadata: { slug: command.slug },
    };
  }

  // approve / reject / delete all share the same "find matching concepts"
  // step. Build the target set first.
  let targets: Array<{ id: string; slug: string; template_name: string; status: string }> = [];
  const target = command.target;

  if (target.scope === 'slug') {
    const { data } = await admin
      .from('ad_concepts')
      .select('id, slug, template_name, status')
      .eq('client_id', clientId)
      .eq('slug', target.slug)
      .limit(1);
    targets = data ?? [];
  } else if ('scope' in target && target.scope === 'rejected') {
    const { data } = await admin
      .from('ad_concepts')
      .select('id, slug, template_name, status')
      .eq('client_id', clientId)
      .eq('status', 'rejected');
    targets = data ?? [];
  } else if (target.scope === 'all') {
    // Match by template_name or slug pattern (case-insensitive substring).
    const { data } = await admin
      .from('ad_concepts')
      .select('id, slug, template_name, status')
      .eq('client_id', clientId)
      .eq('status', 'pending');
    if (target.pattern) {
      const needle = target.pattern.toLowerCase();
      targets = (data ?? []).filter(
        (c) =>
          (c.slug as string).toLowerCase().includes(needle) ||
          (c.template_name as string).toLowerCase().includes(needle),
      );
    } else {
      targets = data ?? [];
    }
  }

  if (targets.length === 0) {
    return {
      summary: `No concepts matched for /${command.kind}.`,
      affectedConcepts: [],
      metadata: {},
    };
  }

  const ids = targets.map((t) => t.id);

  if (command.kind === 'delete') {
    // Best-effort clean up any rendered images first so we don't orphan
    // storage objects.
    const { data: withImages } = await admin
      .from('ad_concepts')
      .select('image_storage_path')
      .in('id', ids);
    const paths = (withImages ?? [])
      .map((r) => r.image_storage_path as string | null)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await admin.storage.from('ad-creatives').remove(paths);
    }

    const { error } = await admin.from('ad_concepts').delete().in('id', ids);
    if (error) {
      return {
        summary: `Delete failed: ${error.message}`,
        affectedConcepts: [],
        metadata: {},
      };
    }
    return {
      summary: `Deleted ${targets.length} concept${targets.length === 1 ? '' : 's'} (${summarizeTargets(targets)}).`,
      affectedConcepts: targets.map((t) => ({ id: t.id, slug: t.slug, status: 'deleted' })),
      metadata: { count: targets.length, ids },
    };
  }

  // approve / reject
  const newStatus = command.kind === 'approve' ? 'approved' : 'rejected';
  const { data: updated, error } = await admin
    .from('ad_concepts')
    .update({ status: newStatus })
    .in('id', ids)
    .select(
      'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
    );
  if (error) {
    return {
      summary: `${command.kind} failed: ${error.message}`,
      affectedConcepts: [],
      metadata: {},
    };
  }

  const verb = command.kind === 'approve' ? 'Approved' : 'Rejected';
  return {
    summary: `${verb} ${updated?.length ?? 0} concept${(updated?.length ?? 0) === 1 ? '' : 's'} (${summarizeTargets(targets)}).`,
    affectedConcepts: updated ?? [],
    metadata: { count: updated?.length ?? 0, ids },
  };
}

function summarizeTargets(
  targets: Array<{ slug: string; template_name: string }>,
): string {
  if (targets.length <= 3) {
    return targets.map((t) => t.slug).join(', ');
  }
  const first = targets.slice(0, 2).map((t) => t.slug).join(', ');
  return `${first}, +${targets.length - 2} more`;
}
