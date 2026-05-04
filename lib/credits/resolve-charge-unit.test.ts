import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveChargeUnit } from './resolve-charge-unit';

interface DropVideoRow {
  id: string;
  revised_video_uploaded_by: string | null;
}
interface ScheduledPostRow {
  id: string;
}

function makeSupabase(
  dropVideo: DropVideoRow | null,
  scheduledPost: ScheduledPostRow | null,
): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'content_drop_videos') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: dropVideo, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'scheduled_posts') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: scheduledPost, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('resolveChargeUnit', () => {
  it('prefers content_drop_videos when one is linked to the scheduled_post', async () => {
    const supabase = makeSupabase(
      { id: 'dv-1', revised_video_uploaded_by: 'user-9' },
      { id: 'sp-1' },
    );
    const result = await resolveChargeUnit(supabase, { scheduledPostId: 'sp-1' });
    expect(result).toEqual({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: 'user-9',
      deliverableId: 'dv-1',
    });
  });

  it('returns null editor when the drop_video has no uploader recorded', async () => {
    const supabase = makeSupabase(
      { id: 'dv-2', revised_video_uploaded_by: null },
      null,
    );
    const result = await resolveChargeUnit(supabase, { scheduledPostId: 'sp-2' });
    expect(result?.kind).toBe('drop_video');
    expect(result?.editorUserId).toBeNull();
    expect(result?.deliverableId).toBe('dv-2');
  });

  it('falls back to scheduled_post when no drop_video is linked', async () => {
    const supabase = makeSupabase(null, { id: 'sp-3' });
    const result = await resolveChargeUnit(supabase, { scheduledPostId: 'sp-3' });
    expect(result).toEqual({
      kind: 'scheduled_post',
      id: 'sp-3',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: null,
    });
  });

  it('returns null when neither a drop_video nor a scheduled_post exists', async () => {
    const supabase = makeSupabase(null, null);
    const result = await resolveChargeUnit(supabase, { scheduledPostId: 'missing' });
    expect(result).toBeNull();
  });

  it('treats a drop_video row without an id as not-found and falls through', async () => {
    // Supabase normally won't return such a row, but the source guards with `dv?.id`
    // so the fallback path must still work.
    const supabase = makeSupabase(
      { id: '', revised_video_uploaded_by: 'user-1' } as DropVideoRow,
      { id: 'sp-4' },
    );
    const result = await resolveChargeUnit(supabase, { scheduledPostId: 'sp-4' });
    expect(result?.kind).toBe('scheduled_post');
    expect(result?.id).toBe('sp-4');
  });

  it('always uses edited_video as the deliverable type slug (Phase A invariant)', async () => {
    const dvCase = await resolveChargeUnit(
      makeSupabase({ id: 'dv', revised_video_uploaded_by: null }, null),
      { scheduledPostId: 'x' },
    );
    const spCase = await resolveChargeUnit(
      makeSupabase(null, { id: 'sp' }),
      { scheduledPostId: 'sp' },
    );
    expect(dvCase?.deliverableTypeSlug).toBe('edited_video');
    expect(spCase?.deliverableTypeSlug).toBe('edited_video');
  });
});
