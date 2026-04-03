/**
 * Batch video analysis for topic search pipeline.
 *
 * Phase A: Transcribe all TikTok videos (captions are free, Whisper fallback).
 * Phase B: FFmpeg frame extraction + Gemini vision analysis on top N by engagement.
 *
 * Results are written back onto PlatformSource objects in-place.
 */

import type { PlatformSource } from '@/lib/types/search';
import { extractTikTokTranscript } from '@/lib/tiktok/scraper';
import { analyzeVisionClipBreakdown } from '@/lib/moodboard/vision-clip-breakdown';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runTopicSearchSourceExtractFrames } from '@/lib/search/topic-search-source-extract-frames';

/** How many videos to run full frame + vision analysis on. */
const FULL_ANALYSIS_COUNT = 50;

/** Max concurrent workers for each phase. */
const CONCURRENCY = 5;

/** Run a batch of async tasks with a concurrency limit. */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

/**
 * Sort sources by engagement (views + likes) descending.
 */
function sortByEngagement(sources: PlatformSource[]): PlatformSource[] {
  return [...sources].sort((a, b) => {
    const scoreA = (a.engagement.views ?? 0) + (a.engagement.likes ?? 0);
    const scoreB = (b.engagement.views ?? 0) + (b.engagement.likes ?? 0);
    return scoreB - scoreA;
  });
}

/**
 * Phase A: Transcribe all TikTok videos.
 * Uses embedded captions (free) with Groq Whisper fallback.
 */
export async function transcribeAllVideos(
  sources: PlatformSource[],
): Promise<{ transcribed: number; failed: number }> {
  const tiktokSources = sources.filter(
    (s) => s.platform === 'tiktok' && !(s.transcript ?? '').trim(),
  );

  let transcribed = 0;
  let failed = 0;

  const tasks = tiktokSources.map((source) => async () => {
    try {
      const result = await extractTikTokTranscript(source.url, null);
      if (result.text.trim()) {
        source.transcript = result.text;
        source.transcript_segments = result.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        }));
        transcribed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);
  return { transcribed, failed };
}

/**
 * Phase B: FFmpeg frame extraction + Gemini vision analysis on top N videos.
 */
export async function analyzeTopVideos(
  sources: PlatformSource[],
  opts: {
    admin: SupabaseClient;
    searchId: string;
    userId: string;
    userEmail?: string;
    count?: number;
  },
): Promise<{ analyzed: number; framesExtracted: number; visionAnalyzed: number }> {
  const count = opts.count ?? FULL_ANALYSIS_COUNT;

  // Sort TikTok sources by engagement, take top N
  const tiktokSources = sortByEngagement(
    sources.filter((s) => s.platform === 'tiktok'),
  ).slice(0, count);

  let framesExtracted = 0;
  let visionAnalyzed = 0;

  const tasks = tiktokSources.map((source) => async () => {
    // Step 1: Extract frames via FFmpeg
    try {
      const frameResult = await runTopicSearchSourceExtractFrames(
        opts.admin,
        opts.searchId,
        source.platform,
        source.id,
        source,
        { id: opts.userId, email: opts.userEmail },
      );
      if (frameResult.ok) {
        // Copy frame data back to source
        const updated = frameResult.source;
        source.frames = updated.frames;
        source.duration_sec = updated.duration_sec;
        source.transcript = updated.transcript || source.transcript;
        source.transcript_segments = updated.transcript_segments || source.transcript_segments;
        framesExtracted++;

        // Step 2: Vision analysis (only if frames were extracted)
        if (source.frames && source.frames.length > 0) {
          try {
            const vision = await analyzeVisionClipBreakdown({
              frames: source.frames.map((f) => ({ url: f.url, timestamp: f.timestamp })),
              videoDurationSec: source.duration_sec ?? 30,
              userId: opts.userId,
              userEmail: opts.userEmail,
            });
            if (vision) {
              source.metadata = {
                ...(source.metadata ?? {}),
                vision_clip_breakdown: vision,
              };
              visionAnalyzed++;
            }
          } catch {
            // Vision analysis is best-effort
          }
        }
      }
    } catch {
      // Frame extraction failed — continue with other videos
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);
  return { analyzed: tiktokSources.length, framesExtracted, visionAnalyzed };
}

/**
 * Build a compact summary of each video for the clustering prompt.
 */
export function buildVideoSummariesForClustering(
  sources: PlatformSource[],
): {
  id: string;
  caption: string;
  hashtags: string[];
  transcript_snippet: string;
  vision_types: string[];
  views: number;
  likes: number;
  er: number;
}[] {
  return sources
    .filter((s) => s.platform === 'tiktok')
    .map((s) => {
      const views = s.engagement.views ?? 0;
      const likes = s.engagement.likes ?? 0;
      const er = views > 0 ? ((likes + (s.engagement.comments ?? 0)) / views) * 100 : 0;

      // Extract vision types from metadata if available
      const visionTypes: string[] = [];
      const visionData = s.metadata?.vision_clip_breakdown as {
        clips?: { clipType: string; startSec: number; endSec: number }[];
      } | null;
      if (visionData?.clips?.length) {
        const typeCounts = new Map<string, number>();
        const totalDuration = visionData.clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0) || 1;
        for (const clip of visionData.clips) {
          const dur = clip.endSec - clip.startSec;
          typeCounts.set(clip.clipType, (typeCounts.get(clip.clipType) ?? 0) + dur);
        }
        for (const [type, dur] of typeCounts) {
          visionTypes.push(`${type}: ${Math.round((dur / totalDuration) * 100)}%`);
        }
      }

      return {
        id: s.id,
        caption: (s.content || s.title || '').slice(0, 150),
        hashtags: [],  // hashtags are in the caption/content
        transcript_snippet: (s.transcript ?? '').slice(0, 200),
        vision_types: visionTypes,
        views,
        likes,
        er: Math.round(er * 10) / 10,
      };
    });
}
