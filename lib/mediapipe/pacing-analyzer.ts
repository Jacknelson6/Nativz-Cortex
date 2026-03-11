import { getObjectDetector } from './index';
import type { ExtractedFrame, PacingAnalysis } from './types';

interface FrameFeature {
  category: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Analyze pacing by detecting scene cuts via object detection.
 * Compares consecutive frames — significant changes in detected
 * objects indicate a scene cut.
 */
export async function analyzePacing(
  frames: ExtractedFrame[],
  videoDurationMs: number
): Promise<PacingAnalysis> {
  if (frames.length < 2) {
    return emptyPacing(videoDurationMs);
  }

  const detector = await getObjectDetector();
  const frameFeatures: FrameFeature[][] = [];

  // Run object detection on each frame
  for (const frame of frames) {
    const result = detector.detect(frame.imageData);
    const features: FrameFeature[] = (result.detections ?? []).map((d) => ({
      category: d.categories?.[0]?.categoryName ?? 'unknown',
      x: d.boundingBox?.originX ?? 0,
      y: d.boundingBox?.originY ?? 0,
      width: d.boundingBox?.width ?? 0,
      height: d.boundingBox?.height ?? 0,
    }));
    frameFeatures.push(features);
  }

  // Compare consecutive frames for cuts
  const cutTimestamps: number[] = [];
  const CUT_THRESHOLD = 0.4; // similarity below this = cut
  const MIN_CUT_INTERVAL_MS = 250; // debounce rapid false positives

  for (let i = 1; i < frames.length; i++) {
    const similarity = compareFrameFeatures(
      frameFeatures[i - 1],
      frameFeatures[i]
    );

    if (similarity < CUT_THRESHOLD) {
      const ts = frames[i].timestamp;
      const lastCut = cutTimestamps[cutTimestamps.length - 1];
      if (lastCut === undefined || ts - lastCut > MIN_CUT_INTERVAL_MS) {
        cutTimestamps.push(ts);
      }
    }
  }

  return buildPacingResult(cutTimestamps, videoDurationMs);
}

function compareFrameFeatures(
  prev: FrameFeature[],
  curr: FrameFeature[]
): number {
  if (prev.length === 0 && curr.length === 0) return 1; // both empty = same
  if (prev.length === 0 || curr.length === 0) return 0; // one empty = different

  const allCategories = new Set([
    ...prev.map((f) => f.category),
    ...curr.map((f) => f.category),
  ]);

  let matchScore = 0;
  let totalComparisons = 0;

  for (const cat of allCategories) {
    const prevItems = prev.filter((f) => f.category === cat);
    const currItems = curr.filter((f) => f.category === cat);

    if (prevItems.length === 0 || currItems.length === 0) {
      // Category missing in one frame
      totalComparisons += Math.max(prevItems.length, currItems.length);
      continue;
    }

    // Compare positions of matching categories
    const pairs = Math.min(prevItems.length, currItems.length);
    for (let i = 0; i < pairs; i++) {
      const p = prevItems[i];
      const c = currItems[i];
      const positionDelta =
        Math.abs(p.x - c.x) / 640 +
        Math.abs(p.y - c.y) / 360 +
        Math.abs(p.width - c.width) / 640 +
        Math.abs(p.height - c.height) / 360;
      // Small delta (< 0.3) = same object in roughly same position
      matchScore += positionDelta < 0.3 ? 1 : 0.3;
      totalComparisons++;
    }
    // Extra items in one frame count as mismatches
    totalComparisons += Math.abs(prevItems.length - currItems.length);
  }

  return totalComparisons > 0 ? matchScore / totalComparisons : 1;
}

function buildPacingResult(
  cutTimestamps: number[],
  videoDurationMs: number
): PacingAnalysis {
  const totalCuts = cutTimestamps.length;

  if (totalCuts === 0) {
    return emptyPacing(videoDurationMs);
  }

  // Build shot durations from cut timestamps
  const boundaries = [0, ...cutTimestamps, videoDurationMs];
  const shotDurations: number[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    shotDurations.push(boundaries[i] - boundaries[i - 1]);
  }

  const cutsPerMinute = totalCuts / (videoDurationMs / 60_000);
  const averageShotDurationMs =
    shotDurations.reduce((a, b) => a + b, 0) / shotDurations.length;

  // Calculate variance (coefficient of variation, normalized 0-1)
  const mean = averageShotDurationMs;
  const variance =
    shotDurations.reduce((sum, d) => sum + (d - mean) ** 2, 0) /
    shotDurations.length;
  const stdDev = Math.sqrt(variance);
  const pacingVariance = Math.min(1, mean > 0 ? stdDev / mean : 0);

  const pacingStyle = classifyPacingStyle(cutsPerMinute);

  return {
    totalCuts,
    cutsPerMinute: Math.round(cutsPerMinute * 10) / 10,
    averageShotDurationMs: Math.round(averageShotDurationMs),
    pacingStyle,
    pacingVariance: Math.round(pacingVariance * 100) / 100,
    shotDurations: shotDurations.map(Math.round),
    cutTimestamps: cutTimestamps.map(Math.round),
  };
}

function classifyPacingStyle(
  cpm: number
): 'slow' | 'moderate' | 'fast' | 'rapid' {
  if (cpm < 3) return 'slow';
  if (cpm < 8) return 'moderate';
  if (cpm < 15) return 'fast';
  return 'rapid';
}

function emptyPacing(videoDurationMs: number): PacingAnalysis {
  return {
    totalCuts: 0,
    cutsPerMinute: 0,
    averageShotDurationMs: videoDurationMs,
    pacingStyle: 'slow',
    pacingVariance: 0,
    shotDurations: [videoDurationMs],
    cutTimestamps: [],
  };
}
