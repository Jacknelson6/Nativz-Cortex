import { getFaceDetector, getObjectDetector, getPoseLandmarker } from './index';
import type { ExtractedFrame, HookVisualAnalysis, VisualHookType } from './types';

// Major pose landmarks for movement energy (indices into 33-landmark array)
const MAJOR_LANDMARKS = [0, 11, 12, 13, 14, 15, 16, 23, 24]; // nose, shoulders, elbows, wrists, hips

/**
 * Analyze the visual hook of a video by processing the first 3 seconds.
 * Uses Face Detection, Pose Landmarks, and Object Detection.
 */
export async function analyzeHook(
  frames: ExtractedFrame[]
): Promise<HookVisualAnalysis> {
  if (frames.length === 0) {
    return emptyHookAnalysis();
  }

  const [faceDetector, poseLandmarker, objectDetector] = await Promise.all([
    getFaceDetector(),
    getPoseLandmarker(),
    getObjectDetector(),
  ]);

  // Per-frame data
  const faceData: Array<{
    hasFace: boolean;
    prominence: number;
    confidence: number;
  }> = [];
  const poseData: Array<Array<{ x: number; y: number }>> = [];
  const objectData: Array<Set<string>> = [];
  let visualChangeCount = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Face detection
    const faceResult = faceDetector.detect(frame.imageData);
    const faces = faceResult.detections ?? [];
    let maxProminence = 0;
    let maxConfidence = 0;
    for (const face of faces) {
      const bb = face.boundingBox;
      if (bb) {
        const area = (bb.width * bb.height) / (640 * 360);
        if (area > maxProminence) {
          maxProminence = area;
          maxConfidence = face.categories?.[0]?.score ?? 0;
        }
      }
    }
    faceData.push({
      hasFace: faces.length > 0,
      prominence: maxProminence,
      confidence: maxConfidence,
    });

    // Pose landmarks
    const poseResult = poseLandmarker.detect(frame.imageData);
    const landmarks: Array<{ x: number; y: number }> = [];
    if (poseResult.landmarks?.[0]) {
      for (const idx of MAJOR_LANDMARKS) {
        const lm = poseResult.landmarks[0][idx];
        if (lm) landmarks.push({ x: lm.x, y: lm.y });
      }
    }
    poseData.push(landmarks);

    // Object detection
    const objResult = objectDetector.detect(frame.imageData);
    const objs = new Set<string>();
    for (const det of objResult.detections ?? []) {
      const name = det.categories?.[0]?.categoryName;
      if (name) objs.add(name);
    }
    objectData.push(objs);

    // Track visual changes between frames
    if (i > 0) {
      const prevObjs = objectData[i - 1];
      const currObjs = objs;
      const prevFace = faceData[i - 1].hasFace;
      const currFace = faceData[i].hasFace;

      const objOverlap = setOverlap(prevObjs, currObjs);
      if (objOverlap < 0.5 || prevFace !== currFace) {
        visualChangeCount++;
      }
    }
  }

  // Calculate metrics
  const faceAppearanceMs = findFirstFaceMs(faceData, frames);
  const faceProminence = Math.max(...faceData.map((f) => f.prominence), 0);
  const movementEnergy = calculateMovementEnergy(poseData);
  const allObjects = new Set<string>();
  for (const objs of objectData) {
    for (const o of objs) allObjects.add(o);
  }
  const objectsDetected = Array.from(allObjects).slice(0, 10);
  const visualComplexity = Math.min(
    1,
    (allObjects.size * 0.15 + visualChangeCount * 0.1)
  );

  // Classify hook type
  const visualHookType = classifyHookType(
    faceData,
    movementEnergy,
    objectData,
    visualChangeCount,
    frames.length
  );

  // Attention grab score (0-10)
  const attentionGrabScore = calculateAttentionScore(
    faceProminence,
    movementEnergy,
    visualComplexity,
    faceAppearanceMs,
    frames
  );

  return {
    visualHookType,
    faceAppearanceMs,
    faceProminence: Math.round(faceProminence * 100) / 100,
    movementEnergy: Math.round(movementEnergy * 100) / 100,
    objectsDetected,
    visualComplexity: Math.round(visualComplexity * 100) / 100,
    attentionGrabScore: Math.round(attentionGrabScore * 10) / 10,
  };
}

function findFirstFaceMs(
  faceData: Array<{ hasFace: boolean }>,
  frames: ExtractedFrame[]
): number | null {
  for (let i = 0; i < faceData.length; i++) {
    if (faceData[i].hasFace) return Math.round(frames[i].timestamp);
  }
  return null;
}

function calculateMovementEnergy(
  poseData: Array<Array<{ x: number; y: number }>>
): number {
  if (poseData.length < 2) return 0;

  let totalMovement = 0;
  let comparisons = 0;

  for (let i = 1; i < poseData.length; i++) {
    const prev = poseData[i - 1];
    const curr = poseData[i];
    if (prev.length === 0 || curr.length === 0) continue;

    const pairs = Math.min(prev.length, curr.length);
    for (let j = 0; j < pairs; j++) {
      const dx = curr[j].x - prev[j].x;
      const dy = curr[j].y - prev[j].y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
      comparisons++;
    }
  }

  if (comparisons === 0) return 0;

  // Normalize: typical movement per landmark per frame is 0-0.1 (normalized coords)
  // High energy ~0.05+ per landmark per frame
  const avgMovement = totalMovement / comparisons;
  return Math.min(1, avgMovement / 0.05);
}

function classifyHookType(
  faceData: Array<{ hasFace: boolean; prominence: number }>,
  movementEnergy: number,
  objectData: Array<Set<string>>,
  visualChangeCount: number,
  totalFrames: number
): VisualHookType {
  // 1. Face close-up: large face in first frame
  if (faceData[0]?.prominence > 0.15) {
    return 'face_close_up';
  }

  // 2. Pattern interrupt: rapid visual changes in first 10 frames
  const earlyChanges = Math.min(totalFrames, 10);
  if (visualChangeCount >= 3 && totalFrames >= earlyChanges) {
    return 'pattern_interrupt';
  }

  // 3. Action start: high movement in first 5 frames
  if (movementEnergy > 0.5) {
    return 'action_start';
  }

  // 4. Object reveal: new prominent object appears after frame 5
  if (totalFrames > 5) {
    const earlyObjs = new Set<string>();
    for (let i = 0; i < Math.min(5, objectData.length); i++) {
      for (const o of objectData[i]) earlyObjs.add(o);
    }
    let newObjCount = 0;
    for (let i = 5; i < objectData.length; i++) {
      for (const o of objectData[i]) {
        if (!earlyObjs.has(o)) newObjCount++;
      }
    }
    if (newObjCount >= 2) return 'object_reveal';
  }

  // 5. Slow build: minimal change in first half, then shift
  if (totalFrames > 15) {
    const halfIdx = Math.floor(totalFrames / 2);
    const firstHalfChanges = countChanges(objectData.slice(0, halfIdx));
    const secondHalfChanges = countChanges(objectData.slice(halfIdx));
    if (firstHalfChanges <= 1 && secondHalfChanges >= 2) {
      return 'slow_build';
    }
  }

  return 'unknown';
}

function countChanges(objectSets: Array<Set<string>>): number {
  let changes = 0;
  for (let i = 1; i < objectSets.length; i++) {
    if (setOverlap(objectSets[i - 1], objectSets[i]) < 0.5) changes++;
  }
  return changes;
}

function setOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

function calculateAttentionScore(
  faceProminence: number,
  movementEnergy: number,
  visualComplexity: number,
  faceAppearanceMs: number | null,
  frames: ExtractedFrame[]
): number {
  // Face prominence: 0-3 points
  const faceScore = Math.min(3, faceProminence * 10);

  // Movement energy: 0-2 points
  const moveScore = movementEnergy * 2;

  // Visual complexity: 0-2 points
  const complexityScore = visualComplexity * 2;

  // Speed of first engagement: 0-3 points
  let speedScore = 0;
  if (faceAppearanceMs !== null && frames.length > 0) {
    if (faceAppearanceMs <= frames[0].timestamp) speedScore = 3;
    else if (faceAppearanceMs <= 1000) speedScore = 2;
    else if (faceAppearanceMs <= 2000) speedScore = 1;
  } else if (movementEnergy > 0.3) {
    speedScore = 1; // some engagement even without face
  }

  return Math.min(10, faceScore + moveScore + complexityScore + speedScore);
}

function emptyHookAnalysis(): HookVisualAnalysis {
  return {
    visualHookType: 'unknown',
    faceAppearanceMs: null,
    faceProminence: 0,
    movementEnergy: 0,
    objectsDetected: [],
    visualComplexity: 0,
    attentionGrabScore: 0,
  };
}
