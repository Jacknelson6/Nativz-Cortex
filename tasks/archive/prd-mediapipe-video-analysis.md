# PRD: MediaPipe Video Analysis Integration

## Introduction

Add Google MediaPipe client-side computer vision to Nativz Cortex's moodboard video analysis pipeline. Currently, pacing analysis returns placeholder zeros, hook scoring is text-only, FORMAT_LABELS are LLM-guessed, and thumbnails are whatever the platform provides. MediaPipe runs in-browser via WASM/WebGL to provide real frame-by-frame detection data that merges with the existing LLM analysis. No new backend infrastructure required.

## Goals

- Replace placeholder `estimated_cuts: 0` and `cuts_per_minute: 0` with real scene-change detection for >95% of analyzed videos
- Add visual hook scoring (face detection, pose landmarks, object detection) to complement existing text-only hook analysis
- Enable accurate FORMAT_LABELS assignment via frame-by-frame content classification with >80% accuracy
- Auto-select visually optimal thumbnails for every video added to a moodboard
- Process entirely client-side in a Web Worker with <20s analysis time for 60s videos
- Gracefully degrade to LLM-only analysis when MediaPipe is unavailable

## User Stories

### US-001: MediaPipe model loader and frame extractor
**Description:** As a developer, I need a shared infrastructure layer that loads MediaPipe models once, caches them in the browser, and extracts frames from video URLs at configurable FPS.

**Acceptance Criteria:**
- [ ] `lib/mediapipe/index.ts` exports lazy singleton getters: `getVision()`, `getObjectDetector()`, `getFaceDetector()`, `getPoseLandmarker()`, `getImageSegmenter()`
- [ ] Models loaded from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm`
- [ ] GPU delegate used by default, falls back to CPU without error
- [ ] `lib/mediapipe/frame-extractor.ts` extracts frames from a video URL using hidden `<video>` + `<canvas>`
- [ ] Frames downscaled to 640x360
- [ ] Accepts `fps` and `maxFrames` parameters (defaults: 4fps, 200 max)
- [ ] `lib/mediapipe/types.ts` contains all TypeScript interfaces for analysis results
- [ ] Typecheck passes

### US-002: Web Worker wrapper for MediaPipe processing
**Description:** As a user, I want MediaPipe analysis to run without freezing the moodboard UI so I can keep working while videos are analyzed.

**Acceptance Criteria:**
- [ ] All MediaPipe processing runs inside a Web Worker
- [ ] Main thread never blocked >50ms during analysis
- [ ] Worker posts progress updates (percentage) back to main thread
- [ ] Worker posts final results back to main thread on completion
- [ ] Worker handles errors gracefully and reports them without crashing
- [ ] Typecheck passes

### US-003: Pacing analysis detects real scene cuts
**Description:** As an admin analyzing a reference video, I want to see actual cut counts and timing so I can understand the video's editing rhythm instead of seeing zeros.

**Acceptance Criteria:**
- [ ] `lib/mediapipe/pacing-analyzer.ts` extracts frames at 4fps and runs Object Detection + Image Segmentation
- [ ] Consecutive frames compared: >60% difference in object positions/types = scene cut
- [ ] Background-only changes (foreground stays) detected as B-roll cuts
- [ ] Returns `PacingAnalysis`: `totalCuts`, `cutsPerMinute`, `averageShotDurationMs`, `pacingStyle`, `pacingVariance`, `shotDurations[]`, `cutTimestamps[]`
- [ ] `pacingStyle` mapping: slow (<3 cuts/min), moderate (3-8), fast (8-15), rapid (>15)
- [ ] `totalCuts` > 0 for videos with visible scene changes
- [ ] Typecheck passes

### US-004: Hook visual analysis classifies first 3 seconds
**Description:** As an admin reviewing a video's hook, I want to know what's happening visually in the first 3 seconds so I can understand why it grabs (or loses) attention beyond just the text.

**Acceptance Criteria:**
- [ ] `lib/mediapipe/hook-analyzer.ts` extracts frames from 0-3s at 10fps (30 frames)
- [ ] Runs Face Detection (face presence, size relative to frame), Pose Landmark (movement energy), Object Detection (objects in hook)
- [ ] Classifies visual hook type: `face_close_up`, `action_start`, `object_reveal`, `text_overlay`, `pattern_interrupt`, `slow_build`, `unknown`
- [ ] `face_close_up` detected when face >15% of frame area in first frame
- [ ] Returns `HookVisualAnalysis`: `visualHookType`, `faceAppearanceMs`, `faceProminence`, `movementEnergy`, `objectsDetected[]`, `visualComplexity`, `attentionGrabScore` (0-10)
- [ ] Classification runs in <2s for 30 frames
- [ ] Typecheck passes

### US-005: Content classification segments video by type
**Description:** As an admin, I want to see what percentage of a video is talking head vs. B-roll vs. product shots so I can understand the visual structure and get accurate format labels.

**Acceptance Criteria:**
- [ ] `lib/mediapipe/content-classifier.ts` samples frames at 2fps across entire video
- [ ] Each frame classified as: `talking_head` (face centered, >15% area), `broll` (no/small face, varied backgrounds), `product_shot` (single prominent object, no face), `text_screen` (large text regions), `transition` (rapid inter-frame change)
- [ ] Consecutive same-type frames aggregated into segments with `startMs`, `endMs`, `confidence`
- [ ] Returns `ContentClassification`: `segments[]`, `ratios` (sum to 1.0), `dominantFormat`, `visualVarietyScore` (0-10), `brollQualityScore` (0-10), `uniqueSceneCount`
- [ ] `dominantFormat` maps to a valid FORMAT_LABELS value from `lib/utils/sentiment.ts`
- [ ] Typecheck passes

### US-006: Smart thumbnail auto-selection
**Description:** As an admin, I want each moodboard video to automatically display the most visually compelling frame as its thumbnail instead of a random or platform-provided one.

**Acceptance Criteria:**
- [ ] `lib/mediapipe/thumbnail-picker.ts` extracts frames at 1fps across entire video
- [ ] Frames scored by: face presence + rule-of-thirds positioning, face detection confidence, object variety (2-5 preferred), not a transition frame, color histogram variety
- [ ] Returns `ThumbnailPickerResult`: top 5 `ThumbnailCandidate` objects (each with `timestampMs`, `score`, `reasons[]`, `dataUrl`) + `bestTimestampMs`
- [ ] Highest-scored frame has a face when video contains faces
- [ ] Transition/blurry frames excluded
- [ ] Returns 1-5 candidates for any video >1s
- [ ] Typecheck passes

### US-007: Database migration for MediaPipe columns
**Description:** As a developer, I need database columns to persist MediaPipe analysis results and thumbnail candidates.

**Acceptance Criteria:**
- [ ] Migration adds `mediapipe_analysis JSONB DEFAULT NULL` to `moodboard_items`
- [ ] Migration adds `thumbnail_candidates JSONB DEFAULT NULL` to `moodboard_items`
- [ ] `MoodboardItem` interface in `lib/types/moodboard.ts` extended with both fields
- [ ] Migration runs without error on existing data
- [ ] Typecheck passes

### US-008: API accepts and merges MediaPipe results
**Description:** As a developer, I need the analyze endpoint to accept MediaPipe data and merge it with the LLM analysis so both sources contribute to the final result.

**Acceptance Criteria:**
- [ ] `POST /api/moodboard/items/[id]/analyze` accepts optional `mediapipeResults` in request body
- [ ] When present: replaces `pacing.estimated_cuts` and `pacing.cuts_per_minute` with MediaPipe values
- [ ] Combined `hook_score` = 0.6 x LLM text score + 0.4 x MediaPipe `attentionGrabScore` (normalized to 1-10)
- [ ] Sets item `format` from `contentClassification.dominantFormat`
- [ ] Stores raw MediaPipe data in `mediapipe_analysis` JSONB column with `processedAt` timestamp and `version: "1.0"`
- [ ] Zod validation on `mediapipeResults` input
- [ ] Typecheck passes

### US-009: Thumbnail save endpoint
**Description:** As a developer, I need an endpoint to upload the auto-selected thumbnail to Supabase Storage and persist the URL.

**Acceptance Criteria:**
- [ ] `POST /api/moodboard/items/[id]/thumbnail` accepts `candidates`, `bestTimestampMs`, `thumbnailDataUrl`
- [ ] Uploads base64 thumbnail to Supabase Storage (`moodboard-thumbnails` bucket)
- [ ] Stores candidates array in `thumbnail_candidates` JSONB column
- [ ] Updates item `thumbnail_url` with the Storage URL
- [ ] Auth check before processing
- [ ] Zod validation on request body
- [ ] Typecheck passes

### US-010: Auto-trigger MediaPipe on video add
**Description:** As an admin, I want MediaPipe analysis to start automatically when I paste a video URL into the moodboard so I don't have to click anything extra.

**Acceptance Criteria:**
- [ ] After item creation in the moodboard page, MediaPipe analysis auto-triggers for video items
- [ ] Runs in parallel with existing transcription auto-trigger
- [ ] Does not re-analyze if `mediapipe_analysis` already populated
- [ ] Sends results to analyze and thumbnail endpoints on completion
- [ ] Handles video load failures gracefully (no error shown to user, falls back to LLM-only)
- [ ] Typecheck passes

### US-011: Progress indicator on video node during analysis
**Description:** As an admin, I want to see that MediaPipe analysis is running on a video so I know it's being processed and can continue working.

**Acceptance Criteria:**
- [ ] Video node card shows progress bar during MediaPipe processing
- [ ] Progress states: loading models → extracting frames → analyzing → complete
- [ ] Percentage updates as frames are processed
- [ ] User can still drag, select, and delete nodes during analysis
- [ ] Progress bar disappears on completion
- [ ] Progress indicator has `aria-live="polite"` for screen readers
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Enhanced pacing section in VideoAnalysisPanel
**Description:** As an admin viewing a video's analysis, I want to see real pacing data with a visual timeline so I can understand the editing rhythm at a glance.

**Acceptance Criteria:**
- [ ] Pacing section shows MediaPipe data when `mediapipe_analysis.pacing` exists
- [ ] Falls back to LLM pacing data when MediaPipe not available
- [ ] Horizontal bar timeline visualization showing shot durations, color-coded (short=warm, long=cool)
- [ ] Stats grid: total cuts, cuts/min, avg shot duration, pacing style badge
- [ ] Timeline has text-equivalent data table for accessibility
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Visual hook analysis in VideoAnalysisPanel
**Description:** As an admin reviewing a video's hook, I want to see both the text and visual hook analysis side by side with a combined score.

**Acceptance Criteria:**
- [ ] Hook section shows visual hook type badge (e.g., "Face close-up", "Pattern interrupt")
- [ ] Combined hook score bar shows weighted breakdown (60% text / 40% visual) with tooltip
- [ ] Visual metrics displayed: face prominence, movement energy, visual complexity (as small bars)
- [ ] Falls back to text-only when `mediapipe_analysis.hook` not available
- [ ] Badge colors meet WCAG AA contrast requirements
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-014: Content breakdown tab in VideoAnalysisPanel
**Description:** As an admin, I want to see a visual breakdown of content types (talking head, B-roll, product shots) so I can understand the video's structure.

**Acceptance Criteria:**
- [ ] New "Content" tab in VideoAnalysisPanel (uses Recharts)
- [ ] Stacked bar or pie chart showing content type ratios
- [ ] Segment timeline below chart with type labels and durations
- [ ] Stats: dominant format badge, visual variety score, B-roll quality score, scene count
- [ ] Tab only visible when `mediapipe_analysis.contentClassification` exists
- [ ] Chart has `aria-label` descriptions for accessibility
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: Auto-selected thumbnail on video node
**Description:** As an admin, I want video nodes to show the MediaPipe-selected thumbnail instead of the platform-provided one for better visual quality.

**Acceptance Criteria:**
- [ ] Video node displays auto-selected thumbnail from `thumbnail_candidates.selectedUrl` when available
- [ ] Falls back to platform `thumbnail_url` when MediaPipe hasn't run
- [ ] No visible flicker or layout shift when thumbnail updates
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Install `@mediapipe/tasks-vision` as sole new dependency
- FR-2: Load MediaPipe models lazily from jsdelivr CDN with singleton caching
- FR-3: Use GPU delegate by default, fall back to CPU without user-visible error
- FR-4: Extract video frames via hidden `<video>` + `<canvas>`, downscaled to 640x360
- FR-5: Run all MediaPipe processing in a Web Worker to keep main thread unblocked
- FR-6: Pacing analyzer: compare consecutive frames at 4fps, detect cuts at >60% object difference threshold
- FR-7: Hook analyzer: process first 3s at 10fps, classify visual hook type from 6 categories + unknown
- FR-8: Content classifier: sample at 2fps, classify frames into 5 types, aggregate into timestamped segments
- FR-9: Thumbnail picker: sample at 1fps, score by face positioning + object variety + color variety, return top 5
- FR-10: Add `mediapipe_analysis` and `thumbnail_candidates` JSONB columns to `moodboard_items`
- FR-11: Analyze endpoint merges MediaPipe results with LLM analysis when present
- FR-12: Combined hook score = 0.6 x LLM text score + 0.4 x MediaPipe visual score
- FR-13: Thumbnail endpoint uploads best frame to Supabase Storage, persists URL
- FR-14: MediaPipe auto-triggers on video add, parallel with transcription
- FR-15: Never re-analyze a video that already has `mediapipe_analysis` populated
- FR-16: Progress indicator on video node during processing with percentage and stage labels
- FR-17: Pacing timeline visualization with color-coded shot durations
- FR-18: Visual hook type badge + combined score breakdown in analysis panel
- FR-19: Content breakdown chart (Recharts) with segment timeline
- FR-20: Video node displays MediaPipe thumbnail with fallback to platform thumbnail
- FR-21: All new UI components meet WCAG AA accessibility standards
- FR-22: Max 200 frames per analysis pass, configurable
- FR-23: Peak memory <500MB during analysis
- FR-24: Graceful degradation: if WebAssembly/WebGL unavailable, silently fall back to LLM-only

## Non-Goals

- No server-side video processing (everything client-side)
- No facial recognition or identity detection (bounding boxes only)
- No audio analysis via MediaPipe (transcript remains LLM-based)
- No manual thumbnail frame selection (auto-select only)
- No real-time video playback analysis (batch frame processing only)
- No custom model training or fine-tuning
- No MediaPipe analysis for image-only moodboard items

## Design Considerations

- Dark theme: all new components use `bg-surface` cards on `bg-background` with blue `accent-text`
- Pacing timeline: horizontal bar chart, warm colors for short shots, cool for long
- Content breakdown: pie chart or stacked bar using Recharts (already in project)
- Hook visual type: small badge next to existing hook score bar
- Progress indicator: thin progress bar overlaid on video node bottom edge
- Reuse existing `VideoAnalysisPanel` tab structure for new "Content" tab
- Sentence case for all copy

## Technical Considerations

- **CORS:** Video URLs must be loadable cross-origin. TikTok URLs expire quickly — process immediately on add. May need server-side proxy for some platforms.
- **Web Worker:** MediaPipe WASM binaries need to be accessible from Worker context. CDN loading handles this.
- **Next.js SSR:** All MediaPipe code is client-only. Guard with `typeof window !== 'undefined'` or dynamic imports.
- **Frame extraction:** Uses `video.currentTime` seeking which is async. Must `await onseeked` for each frame.
- **Model sizes:** ~15MB total first load. Cached by browser after. First analysis will be slower (~10s model load + analysis).
- **Existing code to update:**
  - `app/api/moodboard/items/[id]/analyze/route.ts` — accept `mediapipeResults`
  - `lib/types/moodboard.ts` — extend `MoodboardItem` interface
  - `components/moodboard/video-analysis-panel.tsx` — add pacing timeline, visual hook, content tab
  - `components/moodboard/nodes/video-node.tsx` — progress indicator + thumbnail swap
  - `app/admin/moodboard/[id]/page.tsx` — auto-trigger MediaPipe on video add

## Success Metrics

- >95% of analyzed videos have non-zero `totalCuts` and `cutsPerMinute`
- Combined hook score (text + visual) provides richer signal than text-only
- Content classification `dominantFormat` matches manual labeling >80% of the time
- Auto-selected thumbnails contain a face when the video has one
- Analysis completes in <20s for videos under 60s on modern hardware
- No UI jank during processing (main thread stays responsive)

## Open Questions

- Should the 60/40 text/visual hook score weighting be configurable or hardcoded?
- What's the proxy strategy for video URLs that fail CORS? Server-side proxy endpoint or skip MediaPipe for those?
- Should we version the MediaPipe model URLs or pin to `@latest`?
- For videos >5 minutes, should we analyze a representative sample or the full video with adaptive frame skipping?
