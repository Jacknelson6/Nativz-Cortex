/**
 * GET /api/deliverables/[clientId]/pipeline
 *
 * Returns the in-flight pipeline snapshot for a client: every drop video
 * bucketed into one of five states (unstarted / in_edit / in_review /
 * approved / delivered) plus per-bucket counts. See `lib/deliverables/get-pipeline.ts`
 * for the state machine definition.
 *
 * Auth model:
 *   - admins (via createServerSupabaseClient + isAdmin check) can request
 *     any client's pipeline
 *   - portal viewers can request only their own client (scoped via
 *     user_client_access)
 *
 * Editor attribution is hydrated from team_members so the response includes
 * a `editorIndex` map the UI can use to render avatars/initials without a
 * second round-trip.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { getDeliverablePipeline } from '@/lib/deliverables/get-pipeline';

interface EditorRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const userIsAdmin = await isAdmin(user.id);

  if (!userIsAdmin) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (!access) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const snapshot = await getDeliverablePipeline(admin, clientId);

  // Hydrate editor display info for the cards. We pull every distinct
  // editor referenced in the snapshot, so the index stays small even on
  // clients with hundreds of cards.
  const editorIds = Array.from(
    new Set(
      snapshot.cards
        .map((c) => c.editorUserId)
        .filter((v): v is string => !!v),
    ),
  );
  let editorIndex: Record<string, { name: string; avatarUrl: string | null }> = {};
  if (editorIds.length > 0) {
    const { data: members } = await admin
      .from('team_members')
      .select('user_id, full_name, avatar_url')
      .in('user_id', editorIds)
      .returns<EditorRow[]>();
    editorIndex = Object.fromEntries(
      (members ?? []).map((m) => [
        m.user_id,
        { name: m.full_name ?? 'Editor', avatarUrl: m.avatar_url },
      ]),
    );
  }

  return NextResponse.json({
    cards: snapshot.cards,
    counts: snapshot.counts,
    editorIndex,
  });
}
