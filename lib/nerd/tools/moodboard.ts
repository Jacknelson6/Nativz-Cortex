import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureNerdVideoAnalysisBoard, addVideoUrlToNerdBoard } from '@/lib/analysis/nerd-chat-pipeline';
import { runMoodboardTranscribe } from '@/lib/analysis/moodboard-transcribe-internal';
import { runMoodboardAnalyzeLlm } from '@/lib/analysis/moodboard-analyze-internal';
import { runMoodboardRescript } from '@/lib/analysis/moodboard-rescript-internal';

function truncate(text: string | null | undefined, max = 120): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export const moodboardTools: ToolDefinition[] = [
  // ── list_moodboards ───────────────────────────────────────────────
  {
    name: 'list_moodboards',
    description:
      'List moodboard boards, optionally filtered by client. Returns up to 20 boards ordered by most recently updated.',
    parameters: z.object({
      client_id: z.string().optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { client_id } = params as { client_id?: string };

        let query = supabase
          .from('moodboard_boards')
          .select('id, name, description, client_id, created_by, updated_at, clients:client_id(id, name)')
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (client_id) {
          query = query.eq('client_id', client_id);
        }

        const { data: boards, error } = await query;

        if (error) {
          return { success: false, error: error.message, cardType: 'moodboard' as const };
        }

        // Get item counts per board
        const boardIds = (boards ?? []).map((b) => b.id);
        let itemCounts: Record<string, number> = {};

        if (boardIds.length > 0) {
          const { data: counts, error: countError } = await supabase
            .from('moodboard_items')
            .select('board_id')
            .in('board_id', boardIds);

          if (!countError && counts) {
            itemCounts = counts.reduce(
              (acc, item) => {
                acc[item.board_id] = (acc[item.board_id] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );
          }
        }

        const result = (boards ?? []).map((b) => {
          const client = b.clients as unknown as { id: string; name: string } | null;
          return {
            id: b.id,
            name: b.name,
            description: b.description,
            client_id: b.client_id,
            client_name: client?.name ?? null,
            created_by: b.created_by,
            updated_at: b.updated_at,
            item_count: itemCounts[b.id] ?? 0,
          };
        });

        return {
          success: true,
          data: result,
          cardType: 'moodboard' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list moodboards',
          cardType: 'moodboard' as const,
        };
      }
    },
  },

  // ── get_moodboard_items ───────────────────────────────────────────
  {
    name: 'get_moodboard_items',
    description:
      'Get all items on a specific moodboard, ordered by creation date.',
    parameters: z.object({
      board_id: z.string(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { board_id } = params as { board_id: string };

        const { data: items, error } = await supabase
          .from('moodboard_items')
          .select('id, board_id, type, url, title, thumbnail_url')
          .eq('board_id', board_id)
          .order('created_at', { ascending: true });

        if (error) {
          return { success: false, error: error.message, cardType: 'moodboard' as const };
        }

        return {
          success: true,
          data: items ?? [],
          cardType: 'moodboard' as const,
          link: { href: `/admin/moodboard/${board_id}`, label: 'View analysis' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get moodboard items',
          cardType: 'moodboard' as const,
        };
      }
    },
  },
  {
    name: 'get_analysis_board_summary',
    description:
      'Summarize an analysis board for strategy work. Aggregates hooks, themes, winning elements, improvement areas, and strongest videos across all analyzed items on the board.',
    parameters: z.object({
      board_id: z.string().describe('Analysis board / moodboard board UUID'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { board_id } = params as { board_id: string };

        const { data: board, error: boardError } = await supabase
          .from('moodboard_boards')
          .select('id, name, client_id')
          .eq('id', board_id)
          .single();

        if (boardError || !board) {
          return { success: false, error: 'Analysis board not found', cardType: 'moodboard' as const };
        }

        const { data: items, error } = await supabase
          .from('moodboard_items')
          .select('id, title, url, hook, hook_score, concept_summary, content_themes, winning_elements, improvement_areas, transcript, stats, status, platform, author_handle')
          .eq('board_id', board_id)
          .order('created_at', { ascending: true });

        if (error) {
          return { success: false, error: error.message, cardType: 'moodboard' as const };
        }

        const rows = (items ?? []) as Array<{
          id: string;
          title: string | null;
          url: string;
          hook: string | null;
          hook_score: number | null;
          concept_summary: string | null;
          content_themes: string[] | null;
          winning_elements: string[] | null;
          improvement_areas: string[] | null;
          transcript: string | null;
          stats: { views?: number; likes?: number; comments?: number; shares?: number } | null;
          status: string | null;
          platform: string | null;
          author_handle: string | null;
        }>;

        const analyzed = rows.filter((row) =>
          row.hook || row.concept_summary || (row.content_themes?.length ?? 0) > 0,
        );

        const themeCounts = new Map<string, number>();
        const winningCounts = new Map<string, number>();
        const improvementCounts = new Map<string, number>();
        let totalHookScore = 0;
        let scoredCount = 0;

        for (const row of analyzed) {
          for (const theme of row.content_themes ?? []) {
            themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
          }
          for (const item of row.winning_elements ?? []) {
            winningCounts.set(item, (winningCounts.get(item) ?? 0) + 1);
          }
          for (const item of row.improvement_areas ?? []) {
            improvementCounts.set(item, (improvementCounts.get(item) ?? 0) + 1);
          }
          if (typeof row.hook_score === 'number') {
            totalHookScore += row.hook_score;
            scoredCount++;
          }
        }

        const strongestVideos = [...analyzed]
          .sort((a, b) => (b.hook_score ?? 0) - (a.hook_score ?? 0))
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            title: row.title ?? row.author_handle ?? row.url,
            hook: truncate(row.hook, 80) || null,
            hook_score: row.hook_score,
            concept_summary: truncate(row.concept_summary, 120) || null,
            platform: row.platform,
            url: row.url,
          }));

        const topThemes = [...themeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([theme, count]) => ({ theme, count }));
        const topWinning = [...winningCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([item, count]) => ({ item, count }));
        const topImprovements = [...improvementCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([item, count]) => ({ item, count }));

        return {
          success: true,
          data: {
            board: {
              id: board.id,
              name: board.name,
              client_id: board.client_id,
            },
            itemCount: rows.length,
            analyzedItemCount: analyzed.length,
            averageHookScore: scoredCount > 0 ? Number((totalHookScore / scoredCount).toFixed(1)) : null,
            topThemes,
            topWinningElements: topWinning,
            topImprovementAreas: topImprovements,
            strongestVideos,
            needsAnalysisCount: rows.length - analyzed.length,
          },
          cardType: 'moodboard' as const,
          link: { href: `/admin/moodboard/${board_id}`, label: 'View analysis board' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to summarize analysis board',
          cardType: 'moodboard' as const,
        };
      }
    },
  },
  {
    name: 'summarize_video_for_strategy',
    description:
      'Summarize a single analyzed board video for strategic use: hook, theme, winning elements, weaknesses, and creative notes. Requires an existing analyzed moodboard item.',
    parameters: z.object({
      item_id: z.string().describe('Moodboard item UUID'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { item_id } = params as { item_id: string };

        const { data: item, error } = await supabase
          .from('moodboard_items')
          .select('id, board_id, title, url, hook, hook_analysis, hook_score, hook_type, concept_summary, content_themes, winning_elements, improvement_areas, transcript, stats, platform, author_handle, pacing, cta, status')
          .eq('id', item_id)
          .single();

        if (error || !item) {
          return { success: false, error: 'Video item not found', cardType: 'moodboard' as const };
        }

        const hasAnalysis =
          !!item.hook ||
          !!item.concept_summary ||
          ((item.content_themes as string[] | null)?.length ?? 0) > 0;
        if (!hasAnalysis) {
          return {
            success: false,
            error: 'This video has not been analyzed yet. Open the analysis board and run analysis first.',
            cardType: 'moodboard' as const,
            link: { href: `/admin/moodboard/${item.board_id}`, label: 'Open analysis board' },
          };
        }

        return {
          success: true,
          data: {
            id: item.id,
            board_id: item.board_id,
            title: item.title ?? item.author_handle ?? item.url,
            platform: item.platform,
            hook: item.hook,
            hookAnalysis: item.hook_analysis,
            hookScore: item.hook_score,
            hookType: item.hook_type,
            conceptSummary: item.concept_summary,
            contentThemes: item.content_themes ?? [],
            winningElements: item.winning_elements ?? [],
            improvementAreas: item.improvement_areas ?? [],
            pacing: item.pacing ?? null,
            cta: item.cta ?? null,
            stats: item.stats ?? null,
            transcriptSnippet: truncate(item.transcript, 240) || null,
            url: item.url,
          },
          cardType: 'moodboard' as const,
          link: { href: `/admin/moodboard/${item.board_id}`, label: 'Open analysis board' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to summarize video',
          cardType: 'moodboard' as const,
        };
      }
    },
  },

  {
    name: 'add_video_url_for_analysis',
    description:
      'Add a public video URL to the Nerd chat analysis pipeline: creates/finds a board, saves the video, and extracts a transcript (TikTok, YouTube, Instagram, or direct .mp4 URL). Use when the user shares a video link or wants transcript/hook work in chat. Optional client_id ties the board to a @mentioned client.',
    parameters: z.object({
      url: z.string().describe('Video page URL or direct link to an .mp4/.webm/.mov file'),
      client_id: z.string().optional().describe('Optional client UUID when working in the context of a specific brand'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data: profile } = await admin.from('users').select('email').eq('id', userId).single();
        const clientId = (params.client_id as string | undefined) ?? undefined;
        const { boardId } = await ensureNerdVideoAnalysisBoard(admin, userId, clientId ?? null);
        const result = await addVideoUrlToNerdBoard(
          admin,
          userId,
          profile?.email ?? null,
          boardId,
          params.url as string,
        );
        if (!result.ok) {
          return { success: false, error: result.error, cardType: 'moodboard' as const };
        }
        return {
          success: true,
          data: {
            itemId: result.itemId,
            boardId: result.boardId,
            transcribed: result.transcribed,
            transcriptError: result.transcriptError ?? null,
          },
          cardType: 'moodboard' as const,
          link: { href: `/admin/moodboard/${result.boardId}`, label: 'Open analysis board' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to add video',
          cardType: 'moodboard' as const,
        };
      }
    },
  },

  {
    name: 'transcribe_analysis_item',
    description:
      'Extract or refresh the transcript for a moodboard / analysis video item by item UUID. Use if transcription failed earlier or the user asks to try again.',
    parameters: z.object({
      item_id: z.string().describe('Moodboard item UUID'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data: profile } = await admin.from('users').select('email').eq('id', userId).single();
        const r = await runMoodboardTranscribe(admin, params.item_id as string, {
          id: userId,
          email: profile?.email ?? null,
        });
        if (!r.ok) {
          return { success: false, error: r.error, cardType: 'moodboard' as const };
        }
        const { data: itemRow } = await admin
          .from('moodboard_items')
          .select('board_id')
          .eq('id', params.item_id as string)
          .maybeSingle();
        const boardHref = itemRow?.board_id
          ? `/admin/moodboard/${itemRow.board_id}`
          : '/admin/search/new';
        return {
          success: true,
          data: { itemId: params.item_id, hasTranscript: !!(r.item.transcript as string)?.length },
          cardType: 'moodboard' as const,
          link: { href: boardHref, label: 'Open analysis board' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Transcription failed',
          cardType: 'moodboard' as const,
        };
      }
    },
  },

  {
    name: 'run_hook_analysis_for_video',
    description:
      'Run AI hook analysis, scoring, themes, and improvement notes for a video item that has (or can work from) transcript/metadata. Call after transcription when the user wants strategic breakdown.',
    parameters: z.object({
      item_id: z.string().describe('Moodboard item UUID'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data: profile } = await admin.from('users').select('email').eq('id', userId).single();
        const r = await runMoodboardAnalyzeLlm(admin, params.item_id as string, {
          id: userId,
          email: profile?.email ?? null,
        });
        if (!r.ok) {
          return { success: false, error: r.error, cardType: 'moodboard' as const };
        }
        const row = r.item;
        const { data: itemRow } = await admin
          .from('moodboard_items')
          .select('board_id')
          .eq('id', params.item_id as string)
          .maybeSingle();
        const boardHref = itemRow?.board_id
          ? `/admin/moodboard/${itemRow.board_id}`
          : '/admin/search/new';
        return {
          success: true,
          data: {
            hook: row.hook,
            hookScore: row.hook_score,
            hookAnalysis: row.hook_analysis,
            conceptSummary: row.concept_summary,
          },
          cardType: 'moodboard' as const,
          link: { href: boardHref, label: 'Open analysis board' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Analysis failed',
          cardType: 'moodboard' as const,
        };
      }
    },
  },

  {
    name: 'generate_video_rescript',
    description:
      'Rewrite the spoken-word script of an analyzed video for a brand (rescript / replication brief). Prefer after hook analysis. Pass client_id when adapting for a specific @mentioned client.',
    parameters: z.object({
      item_id: z.string().describe('Moodboard item UUID'),
      client_id: z.string().optional().describe('Client UUID for brand voice from the database'),
      brand_voice: z.string().optional(),
      product: z.string().optional(),
      target_audience: z.string().optional(),
      notes: z.string().optional().describe('Extra adaptation notes from the user'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data: profile } = await admin.from('users').select('email').eq('id', userId).single();
        const r = await runMoodboardRescript(admin, params.item_id as string, { id: userId, email: profile?.email ?? null }, {
          client_id: params.client_id as string | undefined,
          brand_voice: params.brand_voice as string | undefined,
          product: params.product as string | undefined,
          target_audience: params.target_audience as string | undefined,
          notes: params.notes as string | undefined,
        });
        if (!r.ok) {
          return { success: false, error: r.error, cardType: 'moodboard' as const };
        }
        const { data: itemRow } = await admin
          .from('moodboard_items')
          .select('board_id')
          .eq('id', params.item_id as string)
          .maybeSingle();
        const boardHref = itemRow?.board_id
          ? `/admin/moodboard/${itemRow.board_id}`
          : '/admin/search/new';
        return {
          success: true,
          data: { scriptPreview: truncate(r.script, 400) },
          cardType: 'moodboard' as const,
          link: { href: boardHref, label: 'Open analysis board' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Rescript failed',
          cardType: 'moodboard' as const,
        };
      }
    },
  },
];
