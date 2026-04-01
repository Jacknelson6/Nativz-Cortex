import type { SupabaseClient } from '@supabase/supabase-js';
import { detectLinkType, linkTypeToItemType } from '@/lib/types/moodboard';
import { gatherQuickMetadataForItemUrl } from '@/lib/analysis/gather-quick-item-metadata';
import { runMoodboardTranscribe } from '@/lib/analysis/moodboard-transcribe-internal';

const NERD_BOARD_NAME = 'Nerd chat — video analysis';

export async function ensureNerdVideoAnalysisBoard(
  admin: SupabaseClient,
  userId: string,
  clientId?: string | null,
): Promise<{ boardId: string; created: boolean }> {
  let query = admin
    .from('moodboard_boards')
    .select('id')
    .eq('name', NERD_BOARD_NAME)
    .is('archived_at', null);

  if (clientId) {
    query = query.eq('client_id', clientId);
  } else {
    query = query.is('client_id', null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing?.id) {
    return { boardId: existing.id, created: false };
  }

  const { data: board, error } = await admin
    .from('moodboard_boards')
    .insert({
      name: NERD_BOARD_NAME,
      description: 'Videos added from The Nerd chat for transcript and hook analysis.',
      client_id: clientId ?? null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !board) {
    throw new Error(error?.message ?? 'Failed to create analysis board');
  }

  return { boardId: board.id, created: true };
}

export type AddVideoResult =
  | {
      ok: true;
      itemId: string;
      boardId: string;
      transcribed: boolean;
      transcriptError?: string;
    }
  | { ok: false; error: string };

/**
 * Creates a moodboard video item and runs transcription (same pipeline as analysis boards).
 */
export async function addVideoUrlToNerdBoard(
  admin: SupabaseClient,
  userId: string,
  userEmail: string | null | undefined,
  boardId: string,
  url: string,
): Promise<AddVideoResult> {
  const linkType = detectLinkType(url.trim());
  const itemType = linkTypeToItemType(linkType);
  if (itemType !== 'video') {
    return { ok: false, error: 'URL must resolve to a video (TikTok, YouTube, Instagram, direct .mp4, etc.).' };
  }

  let quickTitle: string | null = null;
  let quickThumbnail: string | null = null;
  let detectedPlatform: string | null = null;
  let authorName: string | null = null;
  let authorHandle: string | null = null;
  let stats: { views: number; likes: number; comments: number; shares: number } | null = null;
  let music: string | null = null;
  let duration: number | null = null;
  let hashtags: string[] = [];

  try {
    const gathered = await gatherQuickMetadataForItemUrl(url.trim(), 'video');
    quickTitle = gathered.quickTitle;
    quickThumbnail = gathered.quickThumbnail;
    detectedPlatform = gathered.detectedPlatform;
    authorName = gathered.authorName;
    authorHandle = gathered.authorHandle;
    stats = gathered.stats;
    music = gathered.music;
    duration = gathered.duration;
    hashtags = gathered.hashtags;
  } catch {
    /* keep defaults */
  }

  const insertData: Record<string, unknown> = {
    board_id: boardId,
    url: url.trim(),
    type: 'video',
    title: quickTitle || 'Untitled video',
    thumbnail_url: quickThumbnail,
    platform: detectedPlatform,
    author_name: authorName,
    author_handle: authorHandle,
    stats,
    music,
    duration,
    hashtags,
    position_x: 100 + Math.random() * 200,
    position_y: 100 + Math.random() * 200,
    created_by: userId,
    status: 'completed',
    width:
      detectedPlatform === 'tiktok' || detectedPlatform === 'instagram' || detectedPlatform === 'facebook'
        ? 240
        : 320,
  };

  const { data: item, error: insertError } = await admin.from('moodboard_items').insert(insertData).select('id').single();

  if (insertError || !item) {
    return { ok: false, error: insertError?.message ?? 'Failed to create video item' };
  }

  await admin.from('moodboard_boards').update({ updated_at: new Date().toISOString() }).eq('id', boardId);

  const itemId = item.id as string;
  let transcribed = false;
  let transcriptError: string | undefined;

  const tr = await runMoodboardTranscribe(admin, itemId, { id: userId, email: userEmail });
  if (tr.ok) {
    transcribed = true;
  } else {
    transcriptError = tr.error;
  }

  return { ok: true, itemId, boardId, transcribed, transcriptError };
}
