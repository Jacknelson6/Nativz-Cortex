import { extractFrames, extractFramesRange, createThumbnailCanvas } from './frame-extractor';
import { analyzePacing } from './pacing-analyzer';
import { analyzeHook } from './hook-analyzer';
import { classifyContent } from './content-classifier';
import { pickThumbnail } from './thumbnail-picker';
import type {
  AnalysisStage,
  PacingAnalysis,
  HookVisualAnalysis,
  ContentClassification,
  ThumbnailPickerResult,
} from './types';

function describeUnknownError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [`${err.name}: ${err.message}`];
    if (err.cause instanceof Error) {
      parts.push(`cause: ${err.cause.message}`);
    }
    return parts.join(' | ');
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export interface AnalysisResult {
  pacing: PacingAnalysis;
  hook: HookVisualAnalysis;
  contentClassification: ContentClassification;
  thumbnails: ThumbnailPickerResult;
}

/**
 * Run all 4 MediaPipe analyzers on a video and return combined results.
 * Runs on the main thread (needs DOM for frame extraction).
 * Reports progress via callback.
 */
export async function runFullAnalysis(
  videoUrl: string,
  videoDurationMs: number,
  onProgress?: (stage: AnalysisStage, percent: number) => void
): Promise<AnalysisResult> {
  // ── Stage 1: Extract frames ─────────────────────────────────────────
  onProgress?.('extracting_frames', 0);

  // Hook frames: first 3s at 10fps
  const hookEndMs = Math.min(3000, videoDurationMs);
  const hookFrames = await extractFramesRange(
    videoUrl,
    0,
    hookEndMs,
    10,
    30,
    (p) => onProgress?.('extracting_frames', p * 0.25)
  );

  // Full video frames at 4fps (for pacing)
  const pacingFrames = await extractFrames(
    videoUrl,
    4,
    200,
    (p) => onProgress?.('extracting_frames', 0.25 + p * 0.25)
  );

  // Subsample for content classification (every 2nd frame = ~2fps)
  const classFrames = pacingFrames.filter((_, i) => i % 2 === 0);

  // Subsample for thumbnails (every 4th frame = ~1fps)
  const thumbFrames = pacingFrames.filter((_, i) => i % 4 === 0);

  onProgress?.('extracting_frames', 1);

  // ── Stage 2: Run analyzers ──────────────────────────────────────────
  onProgress?.('analyzing', 0);

  const pacing = await analyzePacing(pacingFrames, videoDurationMs);
  onProgress?.('analyzing', 0.25);

  const hook = await analyzeHook(hookFrames);
  onProgress?.('analyzing', 0.5);

  const contentClassification = await classifyContent(
    classFrames,
    videoDurationMs
  );
  onProgress?.('analyzing', 0.75);

  const canvas = createThumbnailCanvas();
  const thumbnails = await pickThumbnail(thumbFrames, canvas);
  onProgress?.('analyzing', 1);

  onProgress?.('complete', 1);

  return { pacing, hook, contentClassification, thumbnails };
}

/**
 * Run full analysis and send results to the API endpoints.
 * Handles all errors silently (logs to console, never throws).
 */
export async function runAndPersistAnalysis(
  itemId: string,
  videoUrl: string,
  videoDurationMs: number,
  onProgress?: (stage: AnalysisStage, percent: number) => void
): Promise<boolean> {
  try {
    onProgress?.('loading_models', 0);

    // Pre-load models (lazy singletons, cached after first load)
    const { getObjectDetector, getFaceDetector, getPoseLandmarker } =
      await import('./index');
    await Promise.all([
      getObjectDetector(),
      getFaceDetector(),
      getPoseLandmarker(),
    ]);
    onProgress?.('loading_models', 1);

    const result = await runFullAnalysis(
      videoUrl,
      videoDurationMs,
      onProgress
    );

    // Send analysis results to the analyze endpoint
    const analyzeRes = await fetch(
      `/api/analysis/items/${itemId}/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediapipeResults: {
            pacing: result.pacing,
            hook: result.hook,
            contentClassification: result.contentClassification,
          },
        }),
      }
    );

    if (!analyzeRes.ok) {
      const body = await analyzeRes.text();
      console.error('MediaPipe: analyze endpoint failed:', analyzeRes.status, body);
      return false;
    }

    // Send thumbnail results
    if (result.thumbnails.candidates.length > 0) {
      const thumbnailRes = await fetch(
        `/api/analysis/items/${itemId}/thumbnail`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidates: result.thumbnails.candidates,
            bestTimestampMs: result.thumbnails.bestTimestampMs,
            thumbnailDataUrl: result.thumbnails.candidates[0].dataUrl,
          }),
        }
      );

      if (!thumbnailRes.ok) {
        console.error(
          'MediaPipe: thumbnail endpoint failed:',
          thumbnailRes.status,
          await thumbnailRes.text()
        );
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error(
      'MediaPipe: analysis failed for item',
      itemId,
      describeUnknownError(err),
      err instanceof Error ? err.stack : err
    );
    return false;
  }
}
