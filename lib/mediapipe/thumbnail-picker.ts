import { getFaceDetector, getObjectDetector } from './index';
import { frameToDataUrl } from './frame-extractor';
import type { ExtractedFrame, ThumbnailCandidate, ThumbnailPickerResult } from './types';

const MAX_CANDIDATES = 5;

/**
 * Score video frames for visual appeal and return the top candidates
 * for thumbnail selection.
 */
export async function pickThumbnail(
  frames: ExtractedFrame[],
  canvas: HTMLCanvasElement
): Promise<ThumbnailPickerResult> {
  if (frames.length === 0) {
    return { candidates: [], bestTimestampMs: 0 };
  }

  const [faceDetector, objectDetector] = await Promise.all([
    getFaceDetector(),
    getObjectDetector(),
  ]);

  const scored: Array<{
    index: number;
    score: number;
    reasons: string[];
    timestamp: number;
  }> = [];

  let prevPixelData: Uint8ClampedArray | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const reasons: string[] = [];
    let score = 0;

    // ── Transition detection (skip these frames) ──────────────────────
    if (prevPixelData !== null) {
      const diff = pixelDifference(prevPixelData, frame.imageData.data);
      if (diff > 0.25) {
        prevPixelData = new Uint8ClampedArray(frame.imageData.data);
        continue; // skip transition frames
      }
    }
    prevPixelData = new Uint8ClampedArray(frame.imageData.data);

    // ── Face scoring (0-4 points) ─────────────────────────────────────
    const frameW = frame.imageData.width;
    const frameH = frame.imageData.height;
    const frameArea = frameW * frameH;

    const faceResult = faceDetector.detect(frame.imageData);
    const faces = faceResult.detections ?? [];
    if (faces.length > 0) {
      const best = faces.reduce(
        (a, b) => {
          const aArea =
            (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0);
          const bArea =
            (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0);
          return bArea > aArea ? b : a;
        },
        faces[0],
      );

      const bb = best.boundingBox;
      if (bb) {
        const confidence = best.categories?.[0]?.score ?? 0;

        const faceRatio = (bb.width * bb.height) / frameArea;

        // Penalize extreme close-ups (face > 40% of frame)
        if (faceRatio > 0.4) {
          score -= 2;
          reasons.push('Too close');
        } else {
          // Sweet spot: 5-25% of frame area
          const sizeScore =
            faceRatio >= 0.05 && faceRatio <= 0.25
              ? 1
              : faceRatio > 0.25
                ? 0.4
                : faceRatio * 10;

          // Rule of thirds positioning
          const centerX = (bb.originX + bb.width / 2) / frameW;
          const centerY = (bb.originY + bb.height / 2) / frameH;
          const thirdX = Math.min(
            Math.abs(centerX - 1 / 3),
            Math.abs(centerX - 2 / 3)
          );
          const thirdY = Math.min(
            Math.abs(centerY - 1 / 3),
            Math.abs(centerY - 2 / 3)
          );
          const thirdScore = 1 - Math.min(1, (thirdX + thirdY) * 3);

          const faceScore = (confidence + sizeScore + thirdScore) * (4 / 3);
          score += Math.min(4, faceScore);

          if (confidence > 0.8) reasons.push('Clear face');
          if (thirdScore > 0.6) reasons.push('Good composition');
          if (faceRatio >= 0.05 && faceRatio <= 0.25) reasons.push('Well-framed');
        }
      }
    }

    // ── Object variety scoring (0-2 points) ───────────────────────────
    const objResult = objectDetector.detect(frame.imageData);
    const objCount = objResult.detections?.length ?? 0;
    const uniqueCategories = new Set(
      (objResult.detections ?? []).map(
        (d) => d.categories?.[0]?.categoryName ?? ''
      )
    );

    if (objCount >= 2 && objCount <= 5) {
      score += 2;
      reasons.push('High object variety');
    } else if (objCount === 1) {
      score += 1;
    } else if (objCount > 5) {
      score += 1;
    }

    // Diversity bonus
    if (uniqueCategories.size >= 3) {
      score += 0.5;
    }

    // ── Color variety scoring (0-2 points) ────────────────────────────
    const colorScore = analyzeColorVariety(frame.imageData.data);
    score += Math.min(2, colorScore);
    if (colorScore > 1.5) reasons.push('Rich colors');

    // ── Sharpness scoring (0-1 point, penalizes motion blur) ────────
    const sharpness = estimateSharpness(frame.imageData.data, frameW);
    if (sharpness > 15) {
      score += 1;
      reasons.push('Sharp');
    } else if (sharpness < 5) {
      score -= 1;
    }

    // ── Temporal bonus: prefer frames from first 20% (hook shot) ────
    if (frames.length > 1) {
      const position = i / frames.length;
      if (position < 0.2) {
        score += 1;
        reasons.push('Hook frame');
      } else if (position < 0.4) {
        score += 0.5;
      }
    }

    scored.push({
      index: i,
      score: Math.round(score * 10) / 10,
      reasons,
      timestamp: frame.timestamp,
    });
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_CANDIDATES);

  // Generate data URLs for top candidates
  const candidates: ThumbnailCandidate[] = top.map((s) => ({
    timestampMs: Math.round(s.timestamp),
    score: s.score,
    reasons: s.reasons.length > 0 ? s.reasons : ['Selected frame'],
    dataUrl: frameToDataUrl(frames[s.index].imageData, canvas),
  }));

  return {
    candidates,
    bestTimestampMs: candidates[0]?.timestampMs ?? 0,
  };
}

function pixelDifference(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray
): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i += 16) {
    diff += Math.abs(a[i] - b[i]) / 255;
  }
  const samples = Math.floor(len / 16);
  return samples > 0 ? diff / samples : 0;
}

/**
 * Estimate sharpness via horizontal Laplacian (edge contrast).
 * Higher = sharper image, lower = blurry/motion-blurred.
 */
function estimateSharpness(data: Uint8ClampedArray, width: number): number {
  let sum = 0;
  let count = 0;
  // Sample every 8th row, every 4th pixel for speed
  const stride = width * 4;
  for (let row = 0; row < data.length / stride; row += 8) {
    const rowStart = row * stride;
    for (let x = 4; x < stride - 4; x += 16) {
      const idx = rowStart + x;
      // Luminance of left, center, right pixels
      const lum = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lap = Math.abs(-lum(idx - 4) + 2 * lum(idx) - lum(idx + 4));
      sum += lap;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function analyzeColorVariety(data: Uint8ClampedArray): number {
  // Simplified color histogram: 8 bins per channel = 512 total
  const BINS = 8;
  const BIN_SIZE = 256 / BINS;
  const histogram = new Uint32Array(BINS * BINS * BINS);

  for (let i = 0; i < data.length; i += 16) {
    // Sample every 4th pixel
    const rBin = Math.min(BINS - 1, Math.floor(data[i] / BIN_SIZE));
    const gBin = Math.min(BINS - 1, Math.floor(data[i + 1] / BIN_SIZE));
    const bBin = Math.min(BINS - 1, Math.floor(data[i + 2] / BIN_SIZE));
    histogram[rBin * BINS * BINS + gBin * BINS + bBin]++;
  }

  const totalSamples = Math.floor(data.length / 16);
  const threshold = totalSamples * 0.01; // 1% of pixels
  let occupiedBins = 0;
  for (let i = 0; i < histogram.length; i++) {
    if (histogram[i] > threshold) occupiedBins++;
  }

  // More occupied bins = more color variety. Max realistic ~60-80 bins
  return Math.min(2, (occupiedBins / 40) * 2);
}
