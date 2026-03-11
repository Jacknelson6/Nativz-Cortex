// ── Pacing Analysis ─────────────────────────────────────────────────────────

export interface PacingAnalysis {
  totalCuts: number;
  cutsPerMinute: number;
  averageShotDurationMs: number;
  pacingStyle: 'slow' | 'moderate' | 'fast' | 'rapid';
  pacingVariance: number; // 0-1, consistency of pacing
  shotDurations: number[]; // ms per shot
  cutTimestamps: number[]; // ms timestamps of each detected cut
}

// ── Hook Visual Analysis ────────────────────────────────────────────────────

export type VisualHookType =
  | 'face_close_up'
  | 'action_start'
  | 'object_reveal'
  | 'text_overlay'
  | 'pattern_interrupt'
  | 'slow_build'
  | 'unknown';

export interface HookVisualAnalysis {
  visualHookType: VisualHookType;
  faceAppearanceMs: number | null; // ms when first face detected, null if never
  faceProminence: number; // 0-1, max face size relative to frame
  movementEnergy: number; // 0-1, body movement in first 3s
  objectsDetected: string[]; // objects visible in hook
  visualComplexity: number; // 0-1, variety of visual elements
  attentionGrabScore: number; // 0-10, composite score
}

// ── Content Classification ──────────────────────────────────────────────────

export type ContentSegmentType =
  | 'talking_head'
  | 'broll'
  | 'product_shot'
  | 'text_screen'
  | 'transition';

export interface ContentSegment {
  type: ContentSegmentType;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface ContentRatios {
  talkingHead: number;
  broll: number;
  productShot: number;
  textScreen: number;
  transition: number;
}

export interface ContentClassification {
  segments: ContentSegment[];
  ratios: ContentRatios;
  dominantFormat: string; // maps to FORMAT_LABELS
  visualVarietyScore: number; // 0-10
  brollQualityScore: number; // 0-10
  uniqueSceneCount: number;
}

// ── Thumbnail Picker ────────────────────────────────────────────────────────

export interface ThumbnailCandidate {
  timestampMs: number;
  score: number;
  reasons: string[];
  dataUrl: string; // base64 thumbnail
}

export interface ThumbnailPickerResult {
  candidates: ThumbnailCandidate[];
  bestTimestampMs: number;
}

// ── Combined MediaPipe Analysis ─────────────────────────────────────────────

export interface MediaPipeAnalysis {
  pacing: PacingAnalysis;
  hook: HookVisualAnalysis;
  contentClassification: ContentClassification;
  processedAt: string; // ISO timestamp
  version: string;
}

// ── Extracted Frame ─────────────────────────────────────────────────────────

export interface ExtractedFrame {
  timestamp: number; // ms
  imageData: ImageData;
}

// ── Worker Messages ─────────────────────────────────────────────────────────

export type AnalysisStage =
  | 'loading_models'
  | 'extracting_frames'
  | 'analyzing'
  | 'complete';

export type WorkerMessage =
  | { type: 'progress'; stage: AnalysisStage; percent: number }
  | {
      type: 'result';
      data: {
        pacing: PacingAnalysis;
        hook: HookVisualAnalysis;
        contentClassification: ContentClassification;
        thumbnails: ThumbnailPickerResult;
      };
    }
  | { type: 'error'; message: string };

export interface WorkerInput {
  videoUrl: string;
  videoDurationMs: number;
}

// ── Stored Thumbnail Candidates (DB shape, no dataUrl) ──────────────────────

export interface StoredThumbnailCandidate {
  timestampMs: number;
  score: number;
  reasons: string[];
}

export interface StoredThumbnailCandidates {
  candidates: StoredThumbnailCandidate[];
  bestTimestampMs: number;
  selectedUrl: string;
}
