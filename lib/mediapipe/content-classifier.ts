import { getFaceDetector, getObjectDetector } from './index';
import type {
  ContentClassification,
  ContentRatios,
  ContentSegment,
  ContentSegmentType,
  ExtractedFrame,
} from './types';

// FORMAT_LABELS mapping from lib/utils/sentiment.ts
const FORMAT_MAP: Record<ContentSegmentType, string> = {
  talking_head: 'talking_head',
  broll: 'broll_montage',
  product_shot: 'product_showcase',
  text_screen: 'ugc_style', // closest match
  transition: 'broll_montage',
};

const MIN_SEGMENT_MS = 500; // merge segments shorter than this

/**
 * Classify video content frame-by-frame into content types and
 * aggregate into segments with ratios.
 */
export async function classifyContent(
  frames: ExtractedFrame[],
  videoDurationMs: number
): Promise<ContentClassification> {
  if (frames.length === 0) {
    return emptyClassification();
  }

  const [faceDetector, objectDetector] = await Promise.all([
    getFaceDetector(),
    getObjectDetector(),
  ]);

  // Classify each frame
  const perFrame: Array<{
    type: ContentSegmentType;
    confidence: number;
    timestamp: number;
  }> = [];

  let prevPixelData: Uint8ClampedArray | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Check for transition (rapid pixel-level change)
    const isTransition =
      prevPixelData !== null &&
      pixelDifference(prevPixelData, frame.imageData.data) > 0.3;
    prevPixelData = new Uint8ClampedArray(frame.imageData.data);

    if (isTransition) {
      perFrame.push({
        type: 'transition',
        confidence: 0.8,
        timestamp: frame.timestamp,
      });
      continue;
    }

    // Face detection
    const faceResult = faceDetector.detect(frame.imageData);
    const faces = faceResult.detections ?? [];
    let maxFaceArea = 0;
    let faceCenterX = 0;
    for (const face of faces) {
      const bb = face.boundingBox;
      if (bb) {
        const area = (bb.width * bb.height) / (640 * 360);
        if (area > maxFaceArea) {
          maxFaceArea = area;
          faceCenterX = (bb.originX + bb.width / 2) / 640;
        }
      }
    }

    // Object detection
    const objResult = objectDetector.detect(frame.imageData);
    const objects = objResult.detections ?? [];
    const nonPersonObjects = objects.filter(
      (d) => d.categories?.[0]?.categoryName !== 'person'
    );

    // Classify
    const classification = classifyFrame(
      maxFaceArea,
      faceCenterX,
      nonPersonObjects.length,
      objects.length,
      frame.imageData
    );

    perFrame.push({ ...classification, timestamp: frame.timestamp });
  }

  // Aggregate into segments
  const frameInterval =
    frames.length > 1 ? frames[1].timestamp - frames[0].timestamp : 500;
  const rawSegments = aggregateSegments(perFrame, frameInterval);
  const segments = mergeShortSegments(rawSegments, MIN_SEGMENT_MS);

  // Calculate ratios
  const ratios = calculateRatios(segments, videoDurationMs);

  // Dominant format
  const dominant = getDominantType(ratios);
  const dominantFormat = FORMAT_MAP[dominant] ?? 'ugc_style';

  // Scores
  const visualVarietyScore = calculateVarietyScore(ratios);
  const brollQualityScore = calculateBrollScore(
    ratios.broll,
    segments.filter((s) => s.type === 'broll').length
  );

  return {
    segments,
    ratios,
    dominantFormat,
    visualVarietyScore,
    brollQualityScore,
    uniqueSceneCount: segments.length,
  };
}

function classifyFrame(
  faceArea: number,
  faceCenterX: number,
  nonPersonObjCount: number,
  totalObjCount: number,
  imageData: ImageData
): { type: ContentSegmentType; confidence: number } {
  // Talking head: large centered face
  if (faceArea > 0.15 && faceCenterX > 0.2 && faceCenterX < 0.8) {
    return { type: 'talking_head', confidence: Math.min(1, faceArea * 3) };
  }

  // Product shot: single prominent non-person object, no large face
  if (faceArea < 0.05 && nonPersonObjCount === 1 && totalObjCount <= 2) {
    return { type: 'product_shot', confidence: 0.7 };
  }

  // Text screen: low pixel variance suggesting flat/text regions
  const variance = pixelVariance(imageData.data);
  if (variance < 0.05 && faceArea < 0.05) {
    return { type: 'text_screen', confidence: 0.6 };
  }

  // B-roll: no significant face, varied content
  if (faceArea < 0.1) {
    return { type: 'broll', confidence: 0.7 };
  }

  // Small face could still be B-roll or talking head
  if (faceArea >= 0.1 && faceArea <= 0.15) {
    return { type: 'talking_head', confidence: 0.5 };
  }

  return { type: 'broll', confidence: 0.5 };
}

function aggregateSegments(
  perFrame: Array<{
    type: ContentSegmentType;
    confidence: number;
    timestamp: number;
  }>,
  frameInterval: number
): ContentSegment[] {
  if (perFrame.length === 0) return [];

  const segments: ContentSegment[] = [];
  let current = {
    type: perFrame[0].type,
    startMs: perFrame[0].timestamp,
    endMs: perFrame[0].timestamp + frameInterval,
    confidenceSum: perFrame[0].confidence,
    count: 1,
  };

  for (let i = 1; i < perFrame.length; i++) {
    if (perFrame[i].type === current.type) {
      current.endMs = perFrame[i].timestamp + frameInterval;
      current.confidenceSum += perFrame[i].confidence;
      current.count++;
    } else {
      segments.push({
        type: current.type,
        startMs: Math.round(current.startMs),
        endMs: Math.round(current.endMs),
        confidence:
          Math.round((current.confidenceSum / current.count) * 100) / 100,
      });
      current = {
        type: perFrame[i].type,
        startMs: perFrame[i].timestamp,
        endMs: perFrame[i].timestamp + frameInterval,
        confidenceSum: perFrame[i].confidence,
        count: 1,
      };
    }
  }
  segments.push({
    type: current.type,
    startMs: Math.round(current.startMs),
    endMs: Math.round(current.endMs),
    confidence:
      Math.round((current.confidenceSum / current.count) * 100) / 100,
  });

  return segments;
}

function mergeShortSegments(
  segments: ContentSegment[],
  minMs: number
): ContentSegment[] {
  if (segments.length <= 1) return segments;

  const merged: ContentSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (curr.endMs - curr.startMs < minMs) {
      // Merge into previous segment
      prev.endMs = curr.endMs;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

function calculateRatios(
  segments: ContentSegment[],
  totalMs: number
): ContentRatios {
  const durations: Record<ContentSegmentType, number> = {
    talking_head: 0,
    broll: 0,
    product_shot: 0,
    text_screen: 0,
    transition: 0,
  };

  for (const seg of segments) {
    durations[seg.type] += seg.endMs - seg.startMs;
  }

  const total = totalMs || 1;
  return {
    talkingHead: Math.round((durations.talking_head / total) * 1000) / 1000,
    broll: Math.round((durations.broll / total) * 1000) / 1000,
    productShot: Math.round((durations.product_shot / total) * 1000) / 1000,
    textScreen: Math.round((durations.text_screen / total) * 1000) / 1000,
    transition: Math.round((durations.transition / total) * 1000) / 1000,
  };
}

function getDominantType(ratios: ContentRatios): ContentSegmentType {
  const entries: [ContentSegmentType, number][] = [
    ['talking_head', ratios.talkingHead],
    ['broll', ratios.broll],
    ['product_shot', ratios.productShot],
    ['text_screen', ratios.textScreen],
    ['transition', ratios.transition],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function calculateVarietyScore(ratios: ContentRatios): number {
  // Shannon entropy normalized to 0-10
  const values = [
    ratios.talkingHead,
    ratios.broll,
    ratios.productShot,
    ratios.textScreen,
    ratios.transition,
  ].filter((v) => v > 0);

  if (values.length <= 1) return 0;

  let entropy = 0;
  for (const v of values) {
    if (v > 0) entropy -= v * Math.log2(v);
  }

  // Max entropy for 5 categories = log2(5) ≈ 2.32
  const maxEntropy = Math.log2(5);
  return Math.round((entropy / maxEntropy) * 10 * 10) / 10;
}

function calculateBrollScore(brollRatio: number, brollSegments: number): number {
  // More B-roll + more variety of B-roll segments = higher quality
  const ratioScore = Math.min(5, brollRatio * 10);
  const segmentScore = Math.min(5, brollSegments * 1.5);
  return Math.round((ratioScore + segmentScore) * 10) / 10;
}

function pixelDifference(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray
): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  // Sample every 16th pixel (every 4th pixel's R channel) for speed
  for (let i = 0; i < len; i += 16) {
    diff += Math.abs(a[i] - b[i]) / 255;
  }
  const samples = Math.floor(len / 16);
  return samples > 0 ? diff / samples : 0;
}

function pixelVariance(data: Uint8ClampedArray): number {
  // Sample luminance variance to detect flat/text screens
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 64) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    sum += lum;
    sumSq += lum * lum;
    count++;
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function emptyClassification(): ContentClassification {
  return {
    segments: [],
    ratios: {
      talkingHead: 0,
      broll: 0,
      productShot: 0,
      textScreen: 0,
      transition: 0,
    },
    dominantFormat: 'unknown',
    visualVarietyScore: 0,
    brollQualityScore: 0,
    uniqueSceneCount: 0,
  };
}
