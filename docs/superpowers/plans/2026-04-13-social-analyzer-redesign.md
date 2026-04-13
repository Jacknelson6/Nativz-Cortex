# Social Analyzer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the social analyzer around a unified competitor landscape UI, adding Gemini video-analysis-based scorecard categories (hook / variety / quality), shaving wall time from ~180s to ~120s, and renaming "Start audit" → "Start analysis."

**Architecture:** Additive JSON on `prospect_audits.analysis_data` (no migration). New pure-function helpers compute deterministic scorecard grades from scraped metadata + Gemini per-video grades. The LLM scorecard prompt narrates the 13 categories and writes per-item `status_reason` strings. Pipeline restructures into `(prospect scrape || competitor discovery+scrape)` → `Gemini video analysis (parallel)` → `scorecard`, with image persistence moved off the critical path via `after()`.

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest · OpenRouter (Gemini 2.0 Flash for vision) · Claude (via existing `createCompletion`) · Apify scrapers (existing) · Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-04-13-social-analyzer-redesign-design.md`

---

## File Structure

**Types (modify):**
- `lib/audit/types.ts` — extend `ScorecardItem` with `status_reason`, add `GeminiGrades` on `CompetitorProfile` + `PlatformReport`, add `ScorecardCategory` union

**Logic (new):**
- `lib/audit/scorecard-helpers.ts` — pure aggregation + ranking + topline builders (TDD)
- `lib/audit/scorecard-helpers.test.ts` — vitest fixtures
- `lib/audit/analyze-videos.ts` — Gemini per-video grader + brand-level concurrency runner
- `lib/audit/analyze-videos.test.ts` — vitest with stubbed OpenRouter

**Logic (modify):**
- `lib/audit/analyze.ts` — rewrite `generateScorecard` prompt + accept new inputs
- `app/api/analyze-social/[id]/process/route.ts` — restructure pipeline

**UI (new):**
- `components/audit/landscape/status-dot.tsx`
- `components/audit/landscape/topline-card.tsx`
- `components/audit/landscape/callout-cards.tsx`
- `components/audit/landscape/account-level-grid.tsx`
- `components/audit/landscape/platform-block.tsx`
- `components/audit/landscape/landscape-view.tsx` — composes the five above

**UI (modify):**
- `components/audit/audit-report.tsx` — wire `LandscapeView`, remove old 2-chart block + `CompetitorComparisonTable` + old scorecard grid
- `components/audit/audit-hub.tsx` — button label
- sidebar nav (path TBD in Task 13 via grep)

---

## Task 1: Types — add ScorecardCategory, status_reason, GeminiGrades

**Files:**
- Modify: `lib/audit/types.ts`

- [ ] **Step 1: Append new types to `lib/audit/types.ts`** (do not touch existing types — additive only)

```ts
// Add at end of file:

/**
 * 13 scorecard categories, grouped for adjacency in the UI.
 * - `_account` suffix denotes account-level rows (not evaluated per-platform).
 */
export type ScorecardCategory =
  // Performance
  | 'engagement_rate'
  | 'avg_views'
  | 'follower_to_view'
  // Cadence
  | 'posting_frequency'
  | 'cadence_trend'
  // Content execution (Gemini-graded)
  | 'content_variety'
  | 'content_quality'
  | 'hook_consistency'
  // Copy & metadata
  | 'caption_optimization'
  | 'hashtag_strategy'
  // Profile & conversion (account-level)
  | 'bio_optimization_account'
  | 'cta_intent_account'
  // Strategy (account-level)
  | 'platform_focus_account';

/** Cadence direction tokens — used in status_reason + callouts. */
export type CadenceDirection = 'up' | 'flat' | 'down';

/** Per-platform Gemini-derived grades. Populated after video analysis. */
export interface GeminiGrades {
  hook_consistency: { percentage: number; status: ScoreStatus };
  content_variety: { count: number; status: ScoreStatus };
  content_quality: { avg: number; status: ScoreStatus };
}
```

- [ ] **Step 2: Add optional `status_reason` to `ScorecardItem`** — edit existing interface in same file:

```ts
export interface ScorecardItem {
  category: string;
  label: string;
  prospectStatus: ScoreStatus;
  prospectValue: string;
  competitors: {
    username: string;
    status: ScoreStatus;
    value: string;
  }[];
  description: string;
  /** Short machine-written "why" for tooltips + callout cards. */
  status_reason?: string;
}
```

- [ ] **Step 3: Add `gemini_grades` to `PlatformReport` and `CompetitorProfile`** — edit existing interfaces:

```ts
export interface PlatformReport {
  platform: AuditPlatform;
  profile: ProspectProfile;
  videos: ProspectVideo[];
  engagementRate: number;
  avgViews: number;
  postingFrequency: string;
  gemini_grades?: GeminiGrades;
}

export interface CompetitorProfile {
  username: string;
  displayName: string;
  platform: AuditPlatform;
  followers: number;
  avatarUrl: string | null;
  profileUrl: string;
  engagementRate: number;
  avgViews: number;
  postingFrequency: string;
  recentVideos: ProspectVideo[];
  gemini_grades?: GeminiGrades;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with no errors in `lib/audit/**`

- [ ] **Step 5: Commit**

```bash
git add lib/audit/types.ts
git commit -m "feat(audit): add ScorecardCategory, GeminiGrades, status_reason types"
```

---

## Task 2: Scorecard aggregation helpers (TDD)

**Files:**
- Create: `lib/audit/scorecard-helpers.ts`
- Test:   `lib/audit/scorecard-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Write `lib/audit/scorecard-helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  aggregateHookConsistency,
  aggregateContentVariety,
  aggregateContentQuality,
  computeCadenceTrend,
  computePlatformFocus,
  rankCompetitorGaps,
  buildTopline,
} from './scorecard-helpers';
import type { ProspectVideo, PlatformReport, AuditScorecard, CompetitorProfile } from './types';
import type { VideoAudit } from './analyze-videos';

const va = (hook_type: VideoAudit['hook_type'], quality_grade: VideoAudit['quality_grade'], format = 'demo'): VideoAudit => ({
  hook_type, quality_grade, format,
  hook_strength: 3, visual_elements: [],
});

describe('aggregateHookConsistency', () => {
  it('returns good when >60% share the same non-none hook_type', () => {
    const videos = [va('question','high'), va('question','high'), va('question','medium'), va('story','medium'), va('demo','low')];
    const r = aggregateHookConsistency(videos);
    expect(r.percentage).toBeCloseTo(0.6, 2);
    expect(r.status).toBe('good');
  });
  it('returns poor when majority are none', () => {
    const videos = [va('none','low'), va('none','low'), va('none','low'), va('demo','medium'), va('story','medium')];
    expect(aggregateHookConsistency(videos).status).toBe('poor');
  });
  it('returns warning in the 30-60% band', () => {
    const videos = [va('question','high'), va('story','high'), va('demo','high'), va('question','medium'), va('story','low')];
    // 2/5 question = 40% → warning
    expect(aggregateHookConsistency(videos).status).toBe('warning');
  });
});

describe('aggregateContentVariety', () => {
  it('good when 3+ distinct formats', () => {
    const videos = [va('question','high','talking-head'), va('story','high','montage'), va('demo','high','close-up')];
    expect(aggregateContentVariety(videos)).toEqual({ count: 3, status: 'good' });
  });
  it('warning with 2 formats', () => {
    const videos = [va('question','high','a'), va('story','high','b')];
    expect(aggregateContentVariety(videos)).toEqual({ count: 2, status: 'warning' });
  });
  it('poor with 1 format', () => {
    const videos = [va('question','high','a'), va('story','high','a')];
    expect(aggregateContentVariety(videos)).toEqual({ count: 1, status: 'poor' });
  });
});

describe('aggregateContentQuality', () => {
  it('maps high=3, medium=2, low=1 and grades the average', () => {
    const videos = [va('story','high'), va('story','high'), va('story','medium')]; // avg (3+3+2)/3=2.67 good
    const r = aggregateContentQuality(videos);
    expect(r.avg).toBeCloseTo(2.67, 1);
    expect(r.status).toBe('good');
  });
  it('poor when avg <1.7', () => {
    const videos = [va('story','low'), va('story','low'), va('story','medium')]; // avg 1.33 poor
    expect(aggregateContentQuality(videos).status).toBe('poor');
  });
});

describe('computeCadenceTrend', () => {
  const mkVideo = (daysAgo: number, views: number): ProspectVideo => ({
    id: `v${daysAgo}`, platform: 'tiktok', description: '', views,
    likes: 0, comments: 0, shares: 0, bookmarks: 0, duration: 30,
    publishDate: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    hashtags: [], url: '', thumbnailUrl: null,
    authorUsername: 'x', authorDisplayName: null, authorAvatar: null, authorFollowers: 0,
  });
  it('up when recent avg views > older by >15%', () => {
    const videos = [
      mkVideo(1, 20000), mkVideo(3, 18000), mkVideo(5, 22000),   // recent half
      mkVideo(20, 10000), mkVideo(25, 12000), mkVideo(30, 11000), // older half
    ];
    expect(computeCadenceTrend(videos)).toBe('up');
  });
  it('down when recent avg views < older by >15%', () => {
    const videos = [
      mkVideo(1, 5000), mkVideo(3, 4000), mkVideo(5, 6000),
      mkVideo(20, 20000), mkVideo(25, 22000), mkVideo(30, 18000),
    ];
    expect(computeCadenceTrend(videos)).toBe('down');
  });
  it('flat within 15%', () => {
    const videos = [
      mkVideo(1, 10000), mkVideo(3, 11000), mkVideo(5, 9000),
      mkVideo(20, 10500), mkVideo(25, 9500), mkVideo(30, 10000),
    ];
    expect(computeCadenceTrend(videos)).toBe('flat');
  });
  it('flat when fewer than 4 dated videos', () => {
    expect(computeCadenceTrend([mkVideo(1, 100), mkVideo(2, 200)])).toBe('flat');
  });
});

describe('computePlatformFocus', () => {
  const mkPlatform = (platform: 'tiktok'|'instagram'|'facebook'|'youtube', views: number, followers: number): PlatformReport => ({
    platform,
    profile: { platform, username: 'x', displayName: 'x', bio: '', followers, following: 0, likes: 0, postsCount: 0, avatarUrl: null, profileUrl: '', verified: false },
    videos: [], engagementRate: 0, avgViews: views, postingFrequency: '',
  });
  it('focused when one platform carries >60% of follower share', () => {
    const r = computePlatformFocus([mkPlatform('instagram', 0, 90000), mkPlatform('tiktok', 0, 5000), mkPlatform('facebook', 0, 5000)]);
    expect(r.focus).toBe('focused');
    expect(r.primary).toBe('instagram');
  });
  it('spread when no single platform dominates', () => {
    const r = computePlatformFocus([mkPlatform('instagram', 0, 30000), mkPlatform('tiktok', 0, 30000), mkPlatform('facebook', 0, 40000)]);
    expect(r.focus).toBe('spread');
    expect(r.primary).toBeUndefined();
  });
  it('spread when zero total followers (empty dataset)', () => {
    const r = computePlatformFocus([mkPlatform('instagram', 0, 0)]);
    expect(r.focus).toBe('spread');
  });
});

describe('rankCompetitorGaps', () => {
  const mkItem = (category: string, ps: 'good'|'warning'|'poor', ...comps: ('good'|'warning'|'poor')[]): any => ({
    category, label: category, prospectStatus: ps, prospectValue: '',
    competitors: comps.map((status, i) => ({ username: `c${i}`, status, value: '' })),
    description: '',
  });
  it('returns up to 3 poor items where at least one competitor is good', () => {
    const sc = { overallScore: 40, items: [
      mkItem('posting_frequency', 'poor', 'good'),
      mkItem('hook_consistency', 'poor', 'good', 'good'),
      mkItem('cta_intent_account', 'poor', 'good'),
      mkItem('bio_optimization_account', 'poor', 'warning'),
      mkItem('engagement_rate', 'good', 'poor'),
    ], summary: '' };
    const gaps = rankCompetitorGaps(sc);
    expect(gaps.map(g => g.category)).toEqual(['posting_frequency', 'hook_consistency', 'cta_intent_account']);
  });
  it('returns empty when prospect leads everywhere', () => {
    const sc = { overallScore: 95, items: [mkItem('posting_frequency', 'good', 'poor')], summary: '' };
    expect(rankCompetitorGaps(sc)).toEqual([]);
  });
});

describe('buildTopline', () => {
  const mkComp = (username: string, score: number): CompetitorProfile & { overallScore?: number } => ({
    username, displayName: username, platform: 'tiktok', followers: 0, avatarUrl: null,
    profileUrl: '', engagementRate: 0, avgViews: 0, postingFrequency: '', recentVideos: [],
    overallScore: score,
  } as any);
  it('announces rank and gap vs leader', () => {
    const sc: AuditScorecard = { overallScore: 52, items: [], summary: '' };
    const comps = [mkComp('a', 90), mkComp('b', 70), mkComp('c', 60)];
    const r = buildTopline(sc, comps);
    expect(r.headline).toMatch(/#4 of 4/);
    expect(r.headline).toMatch(/losing leader by 38%/);
  });
  it('leader case', () => {
    const sc: AuditScorecard = { overallScore: 95, items: [], summary: '' };
    const comps = [mkComp('a', 70)];
    expect(buildTopline(sc, comps).headline).toMatch(/lead the category/i);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- scorecard-helpers`
Expected: all tests fail with "Cannot find module './scorecard-helpers'"

- [ ] **Step 3: Implement `lib/audit/scorecard-helpers.ts`**

```ts
import type {
  AuditScorecard,
  CadenceDirection,
  CompetitorProfile,
  PlatformReport,
  ProspectVideo,
  ScoreStatus,
  ScorecardItem,
} from './types';
import type { VideoAudit } from './analyze-videos';

/** Hook consistency = share of non-"none" hook_types matching the mode. */
export function aggregateHookConsistency(videos: VideoAudit[]): { percentage: number; status: ScoreStatus } {
  if (videos.length === 0) return { percentage: 0, status: 'poor' };
  const noneCount = videos.filter((v) => v.hook_type === 'none').length;
  if (noneCount / videos.length > 0.5) return { percentage: 0, status: 'poor' };
  const counts = new Map<string, number>();
  for (const v of videos) {
    if (v.hook_type === 'none') continue;
    counts.set(v.hook_type, (counts.get(v.hook_type) ?? 0) + 1);
  }
  const modeCount = Math.max(...counts.values(), 0);
  const percentage = modeCount / videos.length;
  const status: ScoreStatus = percentage > 0.6 ? 'good' : percentage >= 0.3 ? 'warning' : 'poor';
  return { percentage, status };
}

export function aggregateContentVariety(videos: VideoAudit[]): { count: number; status: ScoreStatus } {
  const distinct = new Set(videos.map((v) => v.format)).size;
  const status: ScoreStatus = distinct >= 3 ? 'good' : distinct === 2 ? 'warning' : 'poor';
  return { count: distinct, status };
}

export function aggregateContentQuality(videos: VideoAudit[]): { avg: number; status: ScoreStatus } {
  if (videos.length === 0) return { avg: 0, status: 'poor' };
  const map: Record<VideoAudit['quality_grade'], number> = { high: 3, medium: 2, low: 1 };
  const avg = videos.reduce((s, v) => s + map[v.quality_grade], 0) / videos.length;
  const status: ScoreStatus = avg >= 2.3 ? 'good' : avg >= 1.7 ? 'warning' : 'poor';
  return { avg, status };
}

/** Cadence trend: compare avg views of newest half vs oldest half of dated videos. */
export function computeCadenceTrend(videos: ProspectVideo[]): CadenceDirection {
  const dated = videos
    .filter((v) => v.publishDate)
    .sort((a, b) => new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime());
  if (dated.length < 4) return 'flat';
  const half = Math.floor(dated.length / 2);
  const recent = dated.slice(0, half);
  const older = dated.slice(-half);
  const avg = (vs: ProspectVideo[]) => vs.reduce((s, v) => s + v.views, 0) / vs.length;
  const recentAvg = avg(recent);
  const olderAvg = avg(older);
  if (olderAvg === 0) return 'flat';
  const delta = (recentAvg - olderAvg) / olderAvg;
  if (delta > 0.15) return 'up';
  if (delta < -0.15) return 'down';
  return 'flat';
}

export function computePlatformFocus(
  platforms: PlatformReport[],
): { focus: 'focused' | 'spread'; primary?: PlatformReport['platform'] } {
  const total = platforms.reduce((s, p) => s + p.profile.followers, 0);
  if (total === 0) return { focus: 'spread' };
  const ranked = [...platforms].sort((a, b) => b.profile.followers - a.profile.followers);
  const top = ranked[0];
  const share = top.profile.followers / total;
  if (share > 0.6) return { focus: 'focused', primary: top.platform };
  return { focus: 'spread' };
}

/**
 * Deterministic callout selection:
 * - Keep items where prospect is "poor" AND at least one competitor is "good".
 * - Rank by weight (posting_frequency / hook_consistency / cta_intent_account = 2x).
 * - Tiebreak by number of competitors that are ahead.
 * - Return top 3.
 */
export function rankCompetitorGaps(scorecard: AuditScorecard): ScorecardItem[] {
  const WEIGHTS: Record<string, number> = {
    posting_frequency: 2,
    hook_consistency: 2,
    cta_intent_account: 2,
  };
  const candidates = scorecard.items.filter(
    (i) => i.prospectStatus === 'poor' && i.competitors.some((c) => c.status === 'good'),
  );
  const scored = candidates.map((item) => {
    const weight = WEIGHTS[item.category] ?? 1;
    const compsAhead = item.competitors.filter((c) => c.status === 'good').length;
    return { item, score: weight * 100 + compsAhead };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.item);
}

/**
 * Topline headline + one-sentence summary.
 * Competitor `overallScore` is read off the object (populated by scorecard LLM;
 * fall back to 0 if absent).
 */
export function buildTopline(
  scorecard: AuditScorecard,
  competitors: (CompetitorProfile & { overallScore?: number })[],
): { headline: string; summary: string } {
  const comps = competitors.map((c) => ({ username: c.username, score: c.overallScore ?? 0 }));
  const all = [{ username: 'prospect', score: scorecard.overallScore }, ...comps];
  all.sort((a, b) => b.score - a.score);
  const rank = all.findIndex((x) => x.username === 'prospect') + 1;
  const total = all.length;

  if (rank === 1) {
    const topGood = scorecard.items.find((i) => i.prospectStatus === 'good');
    return {
      headline: `You lead the category — widest gap on ${topGood?.label ?? 'overall performance'}`,
      summary: scorecard.summary,
    };
  }

  const leader = all[0];
  const gap = Math.max(0, leader.score - scorecard.overallScore);
  const gapPct = leader.score > 0 ? Math.round((gap / leader.score) * 100) : 0;
  const topGood = scorecard.items.find((i) => i.prospectStatus === 'good');
  const topPoor = scorecard.items.find((i) => i.prospectStatus === 'poor');
  return {
    headline: `You're #${rank} of ${total} overall — losing leader by ${gapPct}%`,
    summary: `Strongest: ${topGood?.label ?? '—'}. Weakest: ${topPoor?.label ?? '—'}.`,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- scorecard-helpers`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/audit/scorecard-helpers.ts lib/audit/scorecard-helpers.test.ts
git commit -m "feat(audit): scorecard aggregation helpers (TDD)"
```

---

## Task 3: Gemini video analysis module

**Files:**
- Create: `lib/audit/analyze-videos.ts`
- Test:   `lib/audit/analyze-videos.test.ts`

The existing `lib/moodboard/vision-clip-breakdown.ts` uses `createOpenRouterRichCompletion` with `google/gemini-2.0-flash-001` — reuse that model/helper but with the simpler audit schema (thumbnail + caption, not full frame extraction — keeps within the 120s budget).

- [ ] **Step 1: Write failing tests**

Write `lib/audit/analyze-videos.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ProspectVideo } from './types';

// Mock the OpenRouter helper BEFORE importing the module under test.
vi.mock('@/lib/ai/openrouter-rich', () => ({
  createOpenRouterRichCompletion: vi.fn(async () => ({
    text: JSON.stringify({
      hook_type: 'question',
      hook_strength: 4,
      format: 'talking-head',
      quality_grade: 'high',
      visual_elements: ['text-overlay', 'on-camera'],
    }),
  })),
}));

import { analyzeVideoForAudit, analyzeVideosForBrand } from './analyze-videos';

const mkVideo = (id: string, views = 1000): ProspectVideo => ({
  id, platform: 'tiktok', description: 'a question hook here',
  views, likes: 0, comments: 0, shares: 0, bookmarks: 0, duration: 30,
  publishDate: null, hashtags: [], url: `https://x.com/${id}`,
  thumbnailUrl: `https://x.com/${id}.jpg`,
  authorUsername: 'x', authorDisplayName: null, authorAvatar: null, authorFollowers: 0,
});

describe('analyzeVideoForAudit', () => {
  it('returns a VideoAudit with normalised fields', async () => {
    const r = await analyzeVideoForAudit(mkVideo('a'));
    expect(r.hook_type).toBe('question');
    expect(r.quality_grade).toBe('high');
    expect(r.format).toBe('talking-head');
  });
});

describe('analyzeVideosForBrand', () => {
  it('skips platforms with fewer than 3 videos (returns empty array)', async () => {
    const videosByPlatform = {
      tiktok: [mkVideo('a'), mkVideo('b')],          // 2 — skipped
      instagram: [mkVideo('c'), mkVideo('d'), mkVideo('e'), mkVideo('f')],
    };
    const r = await analyzeVideosForBrand(videosByPlatform as any);
    expect(r.tiktok).toEqual([]);
    expect(r.instagram.length).toBe(4);
  });
  it('caps at top 5 by view count per platform', async () => {
    const videos = Array.from({ length: 10 }, (_, i) => mkVideo(`v${i}`, i * 100));
    const r = await analyzeVideosForBrand({ tiktok: videos } as any);
    expect(r.tiktok.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- analyze-videos`
Expected: fails with "Cannot find module"

- [ ] **Step 3: Implement `lib/audit/analyze-videos.ts`**

```ts
import { z } from 'zod';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import type { AuditPlatform, ProspectVideo } from './types';

const MODEL = process.env.OPENROUTER_AUDIT_VISION_MODEL?.trim() || 'google/gemini-2.0-flash-001';

const VIDEOS_PER_PLATFORM = 5;
const MIN_VIDEOS_TO_GRADE = 3;
const CONCURRENCY = 5;

export const VideoAuditSchema = z.object({
  hook_type: z.enum(['question', 'stat', 'story', 'demo', 'none']),
  hook_strength: z.number().int().min(1).max(5),
  format: z.string().min(1),
  quality_grade: z.enum(['high', 'medium', 'low']),
  visual_elements: z.array(z.string()).default([]),
});
export type VideoAudit = z.infer<typeof VideoAuditSchema>;

const PROMPT = `You are grading a short-form video for a sales analysis.
Given the caption and thumbnail, score the video for:
- hook_type: the opening hook pattern. "question" | "stat" | "story" | "demo" | "none"
- hook_strength: 1-5 (5 = strongest)
- format: 1-3 word label e.g. "talking-head", "product-demo", "montage"
- quality_grade: "high" (pro lighting/framing, crisp visuals) | "medium" | "low" (shaky, dim, unclear)
- visual_elements: short tags of visible elements (e.g. "text-overlay", "b-roll")

Return ONLY JSON matching:
{"hook_type":"...","hook_strength":1,"format":"...","quality_grade":"...","visual_elements":["..."]}
`;

export async function analyzeVideoForAudit(video: ProspectVideo): Promise<VideoAudit> {
  const userText = `Caption: ${video.description || '(none)'}\nPlatform: ${video.platform}\nDuration: ${video.duration ?? 'unknown'}s\nViews: ${video.views}`;
  const thumbnail = video.thumbnailUrl;
  try {
    const result = await createOpenRouterRichCompletion({
      model: MODEL,
      messages: [
        { role: 'system', content: PROMPT },
        {
          role: 'user',
          content: thumbnail
            ? [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: thumbnail } },
              ]
            : userText,
        },
      ],
      responseFormat: { type: 'json_object' },
      maxTokens: 400,
    });
    const parsed = parseAIResponseJSON<unknown>(result.text);
    return VideoAuditSchema.parse(parsed);
  } catch (err) {
    console.warn('[audit.analyze-videos] Gemini grade failed, using none/low fallback:', err);
    return { hook_type: 'none', hook_strength: 1, format: 'unknown', quality_grade: 'low', visual_elements: [] };
  }
}

/**
 * Grade the top-N videos per platform for one brand.
 * Platforms with fewer than MIN_VIDEOS_TO_GRADE videos return `[]` so the
 * scorecard can render `—` with the "not enough videos" tooltip.
 */
export async function analyzeVideosForBrand(
  videosByPlatform: Partial<Record<AuditPlatform, ProspectVideo[]>>,
): Promise<Record<AuditPlatform, VideoAudit[]>> {
  const out: Record<AuditPlatform, VideoAudit[]> = {
    tiktok: [], instagram: [], facebook: [], youtube: [], linkedin: [],
  };
  for (const [platformKey, videos] of Object.entries(videosByPlatform) as [AuditPlatform, ProspectVideo[]][]) {
    if (!videos || videos.length < MIN_VIDEOS_TO_GRADE) {
      out[platformKey] = [];
      continue;
    }
    const top = [...videos].sort((a, b) => b.views - a.views).slice(0, VIDEOS_PER_PLATFORM);
    out[platformKey] = await runWithConcurrency(top.map((v) => () => analyzeVideoForAudit(v)), CONCURRENCY);
  }
  return out;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- analyze-videos`
Expected: PASS. The mock covers the OpenRouter call; the real Gemini endpoint is not hit.

- [ ] **Step 5: Commit**

```bash
git add lib/audit/analyze-videos.ts lib/audit/analyze-videos.test.ts
git commit -m "feat(audit): Gemini per-video grader + brand concurrency runner"
```

---

## Task 4: Rewrite `generateScorecard` for 13 categories + Gemini inputs

**Files:**
- Modify: `lib/audit/analyze.ts` (only the `generateScorecard` function + its inputs)

- [ ] **Step 1: Read current signature**

```bash
grep -n "export async function generateScorecard" lib/audit/analyze.ts
```

Expected: one match near line 120. Skim its current parameters.

- [ ] **Step 2: Replace `generateScorecard` with the new signature**

Replace the existing function body (and prompt) with:

```ts
import type { GeminiGrades, PlatformReport, CompetitorProfile, AuditScorecard, ScorecardItem, CadenceDirection } from './types';
import {
  aggregateContentQuality,
  aggregateContentVariety,
  aggregateHookConsistency,
  computeCadenceTrend,
  computePlatformFocus,
} from './scorecard-helpers';
import type { VideoAudit } from './analyze-videos';

/** Per-brand Gemini grades, keyed by platform. */
export type BrandVideoAudits = Partial<Record<PlatformReport['platform'], VideoAudit[]>>;

export interface ScorecardInputs {
  platformSummaries: PlatformReport[];
  competitors: CompetitorProfile[];
  websiteContext: { title: string; industry: string } | null;
  prospectVideoAudits: BrandVideoAudits;
  competitorVideoAudits: Record<string, BrandVideoAudits>; // keyed by competitor username
}

const LABELS: Record<string, string> = {
  engagement_rate: 'Engagement rate',
  avg_views: 'Avg views',
  follower_to_view: 'Follower-to-view ratio',
  posting_frequency: 'Posting frequency',
  cadence_trend: 'Cadence trend',
  content_variety: 'Content variety',
  content_quality: 'Content quality',
  hook_consistency: 'Hook consistency',
  caption_optimization: 'Caption optimization',
  hashtag_strategy: 'Hashtag strategy',
  bio_optimization_account: 'Bio optimization',
  cta_intent_account: 'CTA / conversion intent',
  platform_focus_account: 'Platform focus',
};

function cadencePhrase(d: CadenceDirection): string {
  if (d === 'up') return '↑ growing';
  if (d === 'down') return '↓ losing momentum';
  return '→ stable';
}

function writeDeterministicItems(inputs: ScorecardInputs): { items: ScorecardItem[]; deltas: Record<string, unknown> } {
  const items: ScorecardItem[] = [];
  const prospect = inputs.platformSummaries;

  // Platform focus (account-level)
  const focus = computePlatformFocus(prospect);
  items.push({
    category: 'platform_focus_account',
    label: LABELS.platform_focus_account,
    prospectStatus: focus.focus === 'focused' ? 'good' : 'warning',
    prospectValue: focus.focus === 'focused' ? `${focus.primary}-focused` : 'Spread thin',
    competitors: [],   // filled by LLM narration pass
    description: '',
  });

  // Per-platform Gemini-derived grades
  for (const platform of prospect) {
    const audits = inputs.prospectVideoAudits[platform.platform] ?? [];
    if (audits.length >= 3) {
      const hc = aggregateHookConsistency(audits);
      const cv = aggregateContentVariety(audits);
      const cq = aggregateContentQuality(audits);
      items.push({
        category: 'hook_consistency',
        label: `${LABELS.hook_consistency} · ${platform.platform}`,
        prospectStatus: hc.status,
        prospectValue: `${Math.round(hc.percentage * 100)}% consistent`,
        competitors: [],
        description: '',
      });
      items.push({
        category: 'content_variety',
        label: `${LABELS.content_variety} · ${platform.platform}`,
        prospectStatus: cv.status,
        prospectValue: `${cv.count} format${cv.count === 1 ? '' : 's'}`,
        competitors: [],
        description: '',
      });
      items.push({
        category: 'content_quality',
        label: `${LABELS.content_quality} · ${platform.platform}`,
        prospectStatus: cq.status,
        prospectValue: cq.avg >= 2.3 ? 'High' : cq.avg >= 1.7 ? 'Mixed' : 'Low',
        competitors: [],
        description: '',
      });
    }
    // Cadence trend
    const trend = computeCadenceTrend(platform.videos);
    items.push({
      category: 'cadence_trend',
      label: `${LABELS.cadence_trend} · ${platform.platform}`,
      prospectStatus: trend === 'up' ? 'good' : trend === 'flat' ? 'warning' : 'poor',
      prospectValue: cadencePhrase(trend),
      competitors: [],
      description: '',
    });
  }

  return { items, deltas: {} };
}

export async function generateScorecard(inputs: ScorecardInputs): Promise<AuditScorecard> {
  const deterministic = writeDeterministicItems(inputs);

  // LLM pass: grade remaining categories + write status_reason + narrate all items with competitor comparisons.
  const prompt = `You are analyzing a prospect's short-form social presence vs up to 3 competitors for a marketing agency sales call.

PROSPECT PLATFORMS:
${JSON.stringify(inputs.platformSummaries.map((p) => ({
    platform: p.platform,
    profile: { username: p.profile.username, bio: p.profile.bio, followers: p.profile.followers },
    avgViews: p.avgViews,
    engagementRate: p.engagementRate,
    postingFrequency: p.postingFrequency,
    videoCount: p.videos.length,
  })), null, 2)}

COMPETITORS:
${JSON.stringify(inputs.competitors.map((c) => ({
    username: c.username,
    platform: c.platform,
    followers: c.followers,
    avgViews: c.avgViews,
    engagementRate: c.engagementRate,
    postingFrequency: c.postingFrequency,
  })), null, 2)}

DETERMINISTIC ITEMS (already graded — you narrate competitor columns + write status_reason):
${JSON.stringify(deterministic.items, null, 2)}

${inputs.websiteContext ? `BUSINESS: ${inputs.websiteContext.title} — ${inputs.websiteContext.industry}` : ''}

GRADE THESE ADDITIONAL CATEGORIES (one item each) using the schema below:
- engagement_rate, avg_views, follower_to_view, posting_frequency (per-platform — emit one item per platform)
- caption_optimization, hashtag_strategy (per-platform — hashtag is binary: "good" if hashtags used, else "poor")
- bio_optimization_account, cta_intent_account (account-level — one item each)

For EVERY item (deterministic + your new ones), fill in:
- competitors: [{username, status: "good"|"warning"|"poor", value: short string}]
- status_reason: one short sentence (≤14 words) explaining WHY the prospect is at this status. Example: "Posts 1.2×/week, Dough Co. posts 5.3×/week." Avoid words like "dying" — prefer "losing momentum".
- description: one neutral sentence explaining what the category means.

Return ONLY JSON matching:
{
  "overallScore": 0-100,
  "items": [/* all items, deterministic + your new ones */],
  "summary": "2-sentence executive summary"
}`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 6000,
    feature: 'audit_scorecard',
    jsonMode: true,
    timeoutMs: 90000,
  });

  try {
    const parsed = parseAIResponseJSON<AuditScorecard>(result.text);
    if (!parsed || !Array.isArray(parsed.items)) {
      return { overallScore: 0, items: deterministic.items, summary: 'Analysis could not be completed.' };
    }
    return parsed;
  } catch {
    return { overallScore: 0, items: deterministic.items, summary: 'Analysis could not be completed.' };
  }
}
```

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test -- audit`
Expected: PASS (existing tests + new scorecard/video tests).

- [ ] **Step 4: Commit**

```bash
git add lib/audit/analyze.ts
git commit -m "feat(audit): 13-category scorecard with deterministic pre-grading"
```

---

## Task 5: Pipeline restructure in process route

**Files:**
- Modify: `app/api/analyze-social/[id]/process/route.ts`

- [ ] **Step 1: Read current structure to confirm insertion points**

```bash
grep -n "await scrapeWebsite\|await extractWebsiteContext\|Promise.allSettled\|await persistAllScrapedImages\|await discoverCompetitorsByWebsite\|await persistAllCompetitorImages\|await generateScorecard" app/api/analyze-social/[id]/process/route.ts
```

Expected: lines roughly at 83, 84, ~143, 187, 200, 218, 226.

- [ ] **Step 2: Restructure the main pipeline block**

Replace the block from `// Step 1: Scrape website` down to the scorecard call with:

```ts
// Step 1: Scrape prospect website + derive context (sequential, gates everything else)
const site = await scrapeWebsite(audit.website_url);
const websiteContext = await extractWebsiteContext(site);

// Step 2: run prospect-platform scrape || competitor discovery+scrape in parallel
const [platformSummaries, competitorDiscovery] = await Promise.all([
  (async () => {
    const results = await Promise.allSettled([
      scrapeTikTokProfile(socialUrls.tiktok),
      scrapeInstagramProfile(socialUrls.instagram),
      scrapeFacebookProfile(socialUrls.facebook),
      scrapeYouTubeProfile(socialUrls.youtube),
    ]);
    return platformReportsFromSettled(results);
  })(),
  discoverCompetitorsByWebsite(websiteContext, /* platforms-so-far: */ []),
]);
const competitors = competitorDiscovery.competitors;

// Step 3: Gemini video analysis — one brand at a time for prospect + each comp
import { analyzeVideosForBrand } from '@/lib/audit/analyze-videos';
const prospectVideoAudits = await analyzeVideosForBrand(
  Object.fromEntries(platformSummaries.map((p) => [p.platform, p.videos])),
);
// Attach to prospect platform reports
for (const p of platformSummaries) {
  const audits = prospectVideoAudits[p.platform] ?? [];
  if (audits.length >= 3) {
    p.gemini_grades = {
      hook_consistency: aggregateHookConsistency(audits),
      content_variety: aggregateContentVariety(audits),
      content_quality: aggregateContentQuality(audits),
    };
  }
}

const competitorVideoAudits: Record<string, BrandVideoAudits> = {};
await runWithConcurrency(
  competitors.map((comp) => async () => {
    const videosByPlatform = { [comp.platform]: comp.recentVideos };
    const audits = await analyzeVideosForBrand(videosByPlatform);
    competitorVideoAudits[comp.username] = audits;
    const perPlatform = audits[comp.platform] ?? [];
    if (perPlatform.length >= 3) {
      comp.gemini_grades = {
        hook_consistency: aggregateHookConsistency(perPlatform),
        content_variety: aggregateContentVariety(perPlatform),
        content_quality: aggregateContentQuality(perPlatform),
      };
    }
  }),
  3,
);

// Step 4: image persistence moved off the critical path
import { after } from 'next/server';
after(async () => {
  try { await persistAllScrapedImages({ platformSummaries, auditId: audit.id }); } catch (e) { console.warn('[audit] image persist failed (non-blocking):', e); }
  try { await persistAllCompetitorImages({ competitors, auditId: audit.id }); } catch (e) { console.warn('[audit] comp image persist failed (non-blocking):', e); }
});

// Step 5: scorecard
const scorecard = await generateScorecard({
  platformSummaries,
  competitors,
  websiteContext,
  prospectVideoAudits,
  competitorVideoAudits,
});
```

Add missing imports at the top:
```ts
import { analyzeVideosForBrand, type BrandVideoAudits } from '@/lib/audit/analyze-videos';
import { aggregateHookConsistency, aggregateContentVariety, aggregateContentQuality } from '@/lib/audit/scorecard-helpers';
import { after } from 'next/server';
```

And a small local `runWithConcurrency` helper at the top of the file (or factor into `@/lib/audit/concurrency.ts` — one-liner, inline is fine for now):

```ts
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() { while (cursor < tasks.length) { const i = cursor++; results[i] = await tasks[i](); } }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Smoke-test via dev server**

Run the dev server and kick off an analysis on a known prospect (e.g. `toastique.com`). Watch the server logs for:
- `[audit] LLM suggested N competitor candidates`
- Gemini per-video logs should appear within ~60-90s of start
- Total wall time should land within ~120-150s (depends on OpenRouter latency)
- Image persistence logs fire AFTER the response returns

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze-social/[id]/process/route.ts
git commit -m "feat(audit): parallelize prospect-scrape with competitor discovery, add Gemini stage, defer image persistence"
```

---

## Task 6: Shared `StatusDot` primitive

**Files:**
- Create: `components/audit/landscape/status-dot.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ScoreStatus } from '@/lib/audit/types';
import { cn } from '@/lib/utils/cn';

const COLOR: Record<ScoreStatus, string> = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  poor: 'bg-red-500',
};

export function StatusDot({
  status,
  reason,
  size = 'md',
}: {
  status: ScoreStatus;
  reason?: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', dim, COLOR[status])}
      title={reason}
      aria-label={reason ? `${status}: ${reason}` : status}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/audit/landscape/status-dot.tsx
git commit -m "feat(audit): shared StatusDot primitive with tooltip"
```

---

## Task 7: `ToplineCard` component

**Files:**
- Create: `components/audit/landscape/topline-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { AuditScorecard, CompetitorProfile } from '@/lib/audit/types';
import { buildTopline } from '@/lib/audit/scorecard-helpers';

export function ToplineCard({
  scorecard,
  competitors,
}: {
  scorecard: AuditScorecard;
  competitors: CompetitorProfile[];
}) {
  const { headline, summary } = buildTopline(scorecard, competitors);
  return (
    <div className="rounded-xl border border-nativz-border bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-4 md:p-5">
      <h3 className="text-base md:text-lg font-semibold text-text-primary">{headline}</h3>
      <p className="mt-1 text-sm leading-relaxed text-text-muted">{summary}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add components/audit/landscape/topline-card.tsx && \
  git commit -m "feat(audit): ToplineCard — headline + summary from scorecard"
```

---

## Task 8: `CalloutCards` component

**Files:**
- Create: `components/audit/landscape/callout-cards.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { AuditScorecard } from '@/lib/audit/types';
import { rankCompetitorGaps } from '@/lib/audit/scorecard-helpers';
import { cn } from '@/lib/utils/cn';

export function CalloutCards({ scorecard }: { scorecard: AuditScorecard }) {
  const gaps = rankCompetitorGaps(scorecard);
  if (gaps.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
      {gaps.map((g) => (
        <div
          key={g.category}
          className={cn(
            'rounded-md border border-nativz-border bg-surface/50 px-3 py-2',
            g.prospectStatus === 'poor' && 'border-l-2 border-l-red-500',
            g.prospectStatus === 'warning' && 'border-l-2 border-l-amber-500',
          )}
        >
          <p className="text-xs font-medium text-text-primary">{g.label}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">{g.status_reason ?? g.description}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add components/audit/landscape/callout-cards.tsx && \
  git commit -m "feat(audit): CalloutCards — top 3 competitor gaps"
```

---

## Task 9: `AccountLevelGrid` component

**Files:**
- Create: `components/audit/landscape/account-level-grid.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { AuditScorecard, CompetitorProfile } from '@/lib/audit/types';
import { StatusDot } from './status-dot';

const ACCOUNT_CATEGORIES = ['platform_focus_account', 'bio_optimization_account', 'cta_intent_account'] as const;

export function AccountLevelGrid({
  scorecard,
  prospectUsername,
  competitors,
}: {
  scorecard: AuditScorecard;
  prospectUsername: string;
  competitors: CompetitorProfile[];
}) {
  // Unique competitor usernames preserving order of discovery
  const compUsernames = Array.from(new Set(competitors.map((c) => c.username))).slice(0, 3);
  const items = ACCOUNT_CATEGORIES
    .map((cat) => scorecard.items.find((i) => i.category === cat))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  if (items.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-nativz-border">
      <div className="border-b border-nativz-border bg-surface/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted">
        Account-level
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-nativz-border bg-surface/20">
            <th className="px-3 py-1.5 text-left font-normal text-text-muted">Metric</th>
            <th className="px-3 py-1.5 text-left font-semibold text-accent-text">{prospectUsername}</th>
            {compUsernames.map((u) => (
              <th key={u} className="px-3 py-1.5 text-left font-normal text-text-secondary">{u}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.category} className="border-b border-nativz-border/60 last:border-b-0">
              <td className="px-3 py-1.5 text-text-secondary">{item.label.replace(' · account', '')}</td>
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot status={item.prospectStatus} reason={item.status_reason} />
                  <span className="text-text-primary">{item.prospectValue}</span>
                </span>
              </td>
              {compUsernames.map((u) => {
                const c = item.competitors.find((x) => x.username === u);
                return (
                  <td key={u} className="px-3 py-1.5">
                    {c ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={c.status} />
                        <span className="text-text-secondary">{c.value}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add components/audit/landscape/account-level-grid.tsx && \
  git commit -m "feat(audit): AccountLevelGrid — 3 rows × (you + comps) with status dots"
```

---

## Task 10: `PlatformBlock` component

**Files:**
- Create: `components/audit/landscape/platform-block.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AuditPlatform, AuditScorecard, CompetitorProfile, PlatformReport } from '@/lib/audit/types';
import { StatusDot } from './status-dot';
import { cn } from '@/lib/utils/cn';

// Order matches the spec's group order; labels match scorecard category strings.
const PER_PLATFORM_ROWS: Array<{ category: string; label: string }> = [
  { category: 'engagement_rate', label: 'Engagement rate' },
  { category: 'avg_views', label: 'Avg views' },
  { category: 'follower_to_view', label: 'Follower-to-view' },
  { category: 'posting_frequency', label: 'Posting frequency' },
  { category: 'cadence_trend', label: 'Cadence trend' },
  { category: 'content_variety', label: 'Content variety' },
  { category: 'content_quality', label: 'Content quality' },
  { category: 'hook_consistency', label: 'Hook consistency' },
  { category: 'caption_optimization', label: 'Caption optimization' },
  { category: 'hashtag_strategy', label: 'Hashtag strategy' },
];

function findItem(scorecard: AuditScorecard, category: string, platform: AuditPlatform) {
  // Scorecard labels follow "<Label> · <platform>" for per-platform items.
  return scorecard.items.find(
    (i) => i.category === category && i.label.toLowerCase().endsWith(platform),
  );
}

export function PlatformBlock({
  platform,
  prospectReport,
  scorecard,
  competitors,
}: {
  platform: AuditPlatform;
  prospectReport: PlatformReport;
  scorecard: AuditScorecard;
  competitors: CompetitorProfile[];
}) {
  const [expanded, setExpanded] = useState(true);
  const compsOnPlatform = competitors.filter((c) => c.platform === platform).slice(0, 3);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-nativz-border">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between bg-surface/40 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold capitalize text-text-primary">{platform}</span>
        <ChevronDown size={14} className={cn('transition-transform text-text-muted', !expanded && '-rotate-90')} />
      </button>
      {expanded && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-nativz-border bg-surface/20">
              <th className="px-3 py-1.5 text-left font-normal text-text-muted">Metric</th>
              <th className="px-3 py-1.5 text-left font-semibold text-accent-text">{prospectReport.profile.username}</th>
              {compsOnPlatform.map((c) => (
                <th key={c.username} className="px-3 py-1.5 text-left font-normal text-text-secondary">{c.username}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PER_PLATFORM_ROWS.map((row) => {
              const item = findItem(scorecard, row.category, platform);
              return (
                <tr key={row.category} className="border-b border-nativz-border/60 last:border-b-0">
                  <td className="px-3 py-1.5 text-text-secondary">{row.label}</td>
                  <td className="px-3 py-1.5">
                    {item ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={item.prospectStatus} reason={item.status_reason} />
                        <span className="text-text-primary">{item.prospectValue}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  {compsOnPlatform.map((comp) => {
                    const compEntry = item?.competitors.find((c) => c.username === comp.username);
                    return (
                      <td key={comp.username} className="px-3 py-1.5">
                        {compEntry ? (
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot status={compEntry.status} />
                            <span className="text-text-secondary">{compEntry.value}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add components/audit/landscape/platform-block.tsx && \
  git commit -m "feat(audit): PlatformBlock — collapsible 10-row per-platform scorecard"
```

---

## Task 11: Compose `LandscapeView` + wire into `audit-report.tsx`

**Files:**
- Create: `components/audit/landscape/landscape-view.tsx`
- Modify: `components/audit/audit-report.tsx`

- [ ] **Step 1: Create the landscape composer**

`components/audit/landscape/landscape-view.tsx`:

```tsx
import type { AuditReport } from '@/lib/audit/types';
import { ToplineCard } from './topline-card';
import { CalloutCards } from './callout-cards';
import { AccountLevelGrid } from './account-level-grid';
import { PlatformBlock } from './platform-block';

export function LandscapeView({ report }: { report: AuditReport }) {
  // Prospect handle — derive from the first platform report (all share the brand).
  const prospectUsername = report.platforms[0]?.profile.displayName ?? 'You';

  return (
    <div className="flex flex-col">
      <ToplineCard scorecard={report.scorecard} competitors={report.competitors} />
      <CalloutCards scorecard={report.scorecard} />
      <AccountLevelGrid
        scorecard={report.scorecard}
        prospectUsername={prospectUsername}
        competitors={report.competitors}
      />
      {report.platforms.map((p) => (
        <PlatformBlock
          key={p.platform}
          platform={p.platform}
          prospectReport={p}
          scorecard={report.scorecard}
          competitors={report.competitors}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Open `components/audit/audit-report.tsx`, find the report render block**

Grep for the competitor section + bar charts: `grep -n "CompetitorComparisonTable\|Avg views per post\|Engagement rate" components/audit/audit-report.tsx`

Expected hits near lines 656-751 (competitor cards + 2 Recharts) and line 1113 (CompetitorComparisonTable function).

- [ ] **Step 3: Replace the old competitor section with `<LandscapeView report={...} />`**

Keep the existing `AuditSourceBrowser` video gallery below.

Remove:
- The competitor cards grid block
- The 2 Recharts bar chart block
- The old scorecard grid render
- The `CompetitorComparisonTable` component definition (dead code after replacement)

Add import:
```ts
import { LandscapeView } from './landscape/landscape-view';
```

And the render:
```tsx
<LandscapeView report={/* existing AuditReport object */} />
<AuditSourceBrowser ... />
```

- [ ] **Step 4: Typecheck + manual render check**

Run: `npx tsc --noEmit`
Expected: PASS.

Run the dev server, open a completed audit URL. Confirm: landscape renders with topline, callouts, account-level grid, and 4 platform blocks. No lingering old charts.

- [ ] **Step 5: Commit**

```bash
git add components/audit/landscape/landscape-view.tsx components/audit/audit-report.tsx
git commit -m "feat(audit): replace old scorecard+charts with unified LandscapeView"
```

---

## Task 12: Rename "Start audit" → "Start analysis"

**Files (to grep + modify):**
- `components/audit/audit-hub.tsx` — entry button
- `components/audit/audit-report.tsx:~390` — confirm-platforms "Start audit" button
- List page heading (likely `app/admin/analyze-social/page.tsx`)
- Sidebar nav label — grep to find

- [ ] **Step 1: Find all visible occurrences**

```bash
grep -rn "Start audit\|Start Audit\|\"Audit\"" components/ app/admin/analyze-social/ app/admin/_sidebar* 2>/dev/null | grep -v node_modules
```

Expected: 4-6 hits.

- [ ] **Step 2: Rename each**

- `components/audit/audit-hub.tsx` — add visible label "Start analysis" to the entry button.
- `components/audit/audit-report.tsx:390` — change "Start audit" / "Add at least one platform" strings — the current code is `{hasPlatforms ? 'Start audit' : 'Add at least one platform'}`. Change "Start audit" to "Start analysis".
- `app/admin/analyze-social/page.tsx` — rename page heading if it says "Audit" (change to "Analysis").
- Sidebar nav — rename the link label from "Audit" → "Analysis" wherever it appears.

Do NOT rename: routes, API paths, DB table `prospect_audits`, Supabase migrations.

- [ ] **Step 3: Manual QA**

Run dev server. Visit `/admin/analyze-social`. Confirm:
- Page heading says "Analysis"
- Sidebar item says "Analysis"
- Entry button on hub says "Start analysis"
- Confirm-platforms button says "Start analysis"
- URL still reads `/admin/analyze-social/...` (unchanged)

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(audit): rename Start audit → Start analysis (UI only)"
```

---

## Task 13: Confirm-platforms screen overhaul

**Files:**
- Modify: `components/audit/audit-report.tsx` (the `confirming_platforms` block, currently around lines 340-397)

Goals (per added scope 2026-04-13):
1. Pre-fill each platform input with the **full scraped URL** from `detectedPlatforms`, not a shortened `@username` placeholder.
2. When a platform is not detected, show a "missing" state: red status dot + em-dash placeholder + `Not found` badge. User can still type a URL manually to override.
3. New section **below** the 4 platform rows: "Competitors (optional)" — 3 URL inputs. If filled, these URLs override LLM competitor discovery. Empty → fall back to auto-discovery (existing behavior).

- [ ] **Step 1: Update platform input defaults + missing state**

Replace the existing per-platform row markup (the `.map((platform) => { ... })` block around line 363-383) with:

```tsx
{(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatformKey[]).map(platform => {
  const detected = detectedPlatforms.find(d => d.platform === platform);
  const missing = !detected && !socialInputs[platform]?.trim();
  // Pre-fill socialInputs with full URL on first render of this screen.
  const value = socialInputs[platform] ?? (detected?.url ?? '');
  return (
    <div key={platform} className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-28 shrink-0">
        <AuditPlatformIcon platform={platform} size="sm" />
        <span className="text-sm text-text-primary font-medium">{PLATFORM_LABELS[platform]}</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setSocialInputs(prev => ({ ...prev, [platform]: e.target.value }))}
        placeholder={missing ? '—' : `${platform}.com/@username`}
        className={cn(
          'flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm focus:outline-none',
          missing
            ? 'border-red-500/40 text-red-300 placeholder:text-red-400/50 focus:border-red-400/60'
            : 'border-nativz-border text-text-primary placeholder:text-text-muted/50 focus:border-accent/40',
        )}
      />
      {detected ? (
        <span className="shrink-0 text-xs text-emerald-400">Auto-detected</span>
      ) : (
        <span className="shrink-0 text-xs text-red-400">Not found</span>
      )}
    </div>
  );
})}
```

Also: on entering the confirm-platforms state, seed `socialInputs` from `detectedPlatforms` with the **full URL** (currently left empty). Locate the effect that fires on detect-socials response (around line 256-272 where `setDetectedPlatforms(data.detectedPlatforms ?? [])` is called). Add:

```ts
const preset: Partial<Record<AuditPlatformKey, string>> = {};
for (const d of data.detectedPlatforms ?? []) {
  if (d.url && (['tiktok','instagram','facebook','youtube'] as const).includes(d.platform as AuditPlatformKey)) {
    preset[d.platform as AuditPlatformKey] = d.url;
  }
}
setSocialInputs(preset);
```

- [ ] **Step 2: Add the competitors input section**

Below the rounded platform-input card (after the closing `</div>` of the `rounded-xl border … space-y-3` wrapper around line 384), add:

```tsx
<div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
  <div>
    <h3 className="text-sm font-semibold text-text-primary">Competitors (optional)</h3>
    <p className="mt-0.5 text-xs text-text-muted">
      Paste up to 3 competitor profile URLs to rank against. Leave blank to auto-discover.
    </p>
  </div>
  {[0, 1, 2].map((i) => (
    <input
      key={i}
      type="text"
      value={competitorUrls[i] ?? ''}
      onChange={(e) => {
        setCompetitorUrls((prev) => {
          const next = [...prev];
          next[i] = e.target.value;
          return next;
        });
      }}
      placeholder={`Competitor ${i + 1} — e.g. tiktok.com/@brandname`}
      className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
    />
  ))}
</div>
```

Add the state at the top of the component, near `socialInputs`:

```ts
const [competitorUrls, setCompetitorUrls] = useState<string[]>(['', '', '']);
```

- [ ] **Step 3: Pass competitor URLs to the start-processing call**

Find `startProcessing()` (referenced at line 390). Inside it, extend the POST body of the resume call with the filtered competitor list:

```ts
const cleanedCompetitors = competitorUrls.map((u) => u.trim()).filter(Boolean);
await fetch(`/api/analyze-social/${audit.id}/resume`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    socials: socialInputs,
    competitor_urls: cleanedCompetitors, // NEW
  }),
});
```

- [ ] **Step 4: Typecheck + manual render**

Run: `npx tsc --noEmit`
Expected: PASS.

Dev server: enter `https://www.toastique.com`. Confirm-platforms screen should:
- Pre-fill the TikTok + IG inputs with full URLs
- Show "Not found" + red input for platforms not on toastique.com
- Show the new Competitors card with 3 empty inputs

- [ ] **Step 5: Commit**

```bash
git add components/audit/audit-report.tsx
git commit -m "feat(audit): confirm-platforms — full URLs, missing state, optional competitor inputs"
```

---

## Task 14: Backend — accept user-provided competitor URLs

**Files:**
- Modify: `app/api/analyze-social/[id]/resume/route.ts` (accept `competitor_urls` in body)
- Modify: `app/api/analyze-social/[id]/process/route.ts` (branch on `competitor_urls` from audit row)
- Modify: `lib/audit/discover-competitors.ts` (export a new `scrapeProvidedCompetitors` path)

- [ ] **Step 1: Find the resume route**

```bash
find app/api/analyze-social -name "route.ts" | xargs grep -l "resume\|socials" | head -5
```

- [ ] **Step 2: Update resume route Zod schema**

In `app/api/analyze-social/[id]/resume/route.ts`, extend the input schema:

```ts
import { z } from 'zod';

const Body = z.object({
  socials: z.record(z.string(), z.string().optional()),
  competitor_urls: z.array(z.string().url()).max(3).optional(),
});

// inside the POST handler, after validating body:
await supabase
  .from('prospect_audits')
  .update({
    socials_confirmed: body.socials,
    competitor_urls_override: body.competitor_urls ?? null, // NEW column-free: stores in analysis_data JSON
    status: 'processing',
  })
  .eq('id', auditId);
```

Since the spec is additive-JSON-only, store `competitor_urls_override` inside the existing `analysis_data` JSONB. Load/merge it:

```ts
const { data: current } = await supabase.from('prospect_audits').select('analysis_data').eq('id', auditId).single();
const nextAnalysisData = { ...(current?.analysis_data ?? {}), competitor_urls_override: body.competitor_urls ?? null };
await supabase.from('prospect_audits').update({ analysis_data: nextAnalysisData, socials_confirmed: body.socials, status: 'processing' }).eq('id', auditId);
```

- [ ] **Step 3: Add `scrapeProvidedCompetitors` to discover-competitors.ts**

In `lib/audit/discover-competitors.ts`, append:

```ts
/**
 * User-provided competitor path: skip LLM discovery, scrape the given URLs directly.
 * Each URL is scraped for its own socials, then platforms matching the prospect's are scraped.
 */
export async function scrapeProvidedCompetitors(
  urls: string[],
  targetPlatforms: AuditPlatform[],
): Promise<CompetitorDiscoveryResult> {
  const failures: CompetitorDiscoveryFailure[] = [];
  const competitors: CompetitorProfile[] = [];
  for (const raw of urls) {
    const normalised = normaliseWebsite(raw);
    if (!normalised) {
      failures.push({ name: raw, website: raw, reason: 'invalid URL' });
      continue;
    }
    try {
      // Reuse the existing per-candidate scrape path (website → socials → per-platform profile scrape)
      const siteResult = await scrapeWebsite(normalised);
      // ...delegate to the same per-candidate loop body already in discoverCompetitorsByWebsite
      // (extract the body into a local `scrapeOne(candidate)` helper and call it from both paths)
    } catch (err) {
      failures.push({ name: raw, website: normalised, reason: String(err) });
    }
  }
  return { competitors, failures };
}
```

**Refactor note:** to keep this DRY, extract the per-candidate logic (inside the `for (const candidate of candidates)` loop around line 246) into a private `scrapeOneCandidate(candidate, targetPlatforms)` helper, then call it from both `discoverCompetitorsByWebsite` and `scrapeProvidedCompetitors`.

- [ ] **Step 4: Branch in the process route**

In `app/api/analyze-social/[id]/process/route.ts`, where you currently call `discoverCompetitorsByWebsite`, branch:

```ts
const override = (audit.analysis_data as any)?.competitor_urls_override as string[] | null | undefined;
const competitorDiscovery = override && override.length > 0
  ? await scrapeProvidedCompetitors(override, platformSummaries.map((p) => p.platform))
  : await discoverCompetitorsByWebsite(websiteContext, platformSummaries);
```

Add import: `import { scrapeProvidedCompetitors } from '@/lib/audit/discover-competitors';`

- [ ] **Step 5: Typecheck + smoke test**

Run: `npx tsc --noEmit`
Expected: PASS.

Dev server: run an analysis with 2 competitor URLs pasted. Confirm server log shows `scrapeProvidedCompetitors` path taken and no LLM discovery call was made.

- [ ] **Step 6: Commit**

```bash
git add app/api/analyze-social/[id]/resume/route.ts app/api/analyze-social/[id]/process/route.ts lib/audit/discover-competitors.ts
git commit -m "feat(audit): accept user-provided competitor URLs (overrides LLM discovery)"
```

---

## Task 15: Full-run manual QA

- [ ] **Step 1: Run a fresh analysis end-to-end**

- Start dev server: `npm run dev`
- Open `/admin/analyze-social`, enter a real website (e.g. `https://www.toastique.com`).
- Watch wall time from "Start analysis" click to report visible. Target: ≤150s.

- [ ] **Step 2: Verify the landscape renders correctly**

Open the completed report. Confirm:
- [ ] Topline card shows rank + gap % (or "You lead the category")
- [ ] 0-3 callout cards appear below topline, each with status_reason text
- [ ] Account-level grid shows 3 rows (platform focus, bio, CTA) with you + up to 3 competitors
- [ ] Each detected platform block shows 10 rows; missing platforms are not rendered
- [ ] Competitors not on a given platform show `—` rather than blank or zero
- [ ] Hook / variety / quality rows render `—` if that brand has <3 videos on that platform
- [ ] No residual old chart or old scorecard grid visible
- [ ] Video gallery (`AuditSourceBrowser`) still renders below

- [ ] **Step 3: Verify pipeline logs**

In server logs confirm you see (approximate order):
- `[audit] competitor discovery...`
- `[audit.analyze-videos]` grade lines for each video
- Scorecard call returns
- Image-persistence logs fire AFTER the response returns (proof `after()` deferred)

- [ ] **Step 4: Record observations in SRL.md**

Append an SRL iteration entry summarizing wall time, number of competitors discovered, number of Gemini calls made, any errors.

- [ ] **Step 5: Commit SRL update**

```bash
git add SRL.md
git commit -m "docs: SRL entry — social analyzer redesign shipped"
```

---

## Self-Review

**Spec coverage:**
- Rename → Task 12 ✓
- 13 scorecard categories → Tasks 1, 4 ✓
- Unified landscape UI (topline + callouts + account grid + per-platform) → Tasks 6-11 ✓
- Pipeline parallelization → Task 5 ✓
- Gemini video analysis + gating (≥3 videos) → Tasks 3, 4, 5 ✓
- Deterministic callout ranking → Task 2 ✓
- Additive JSON (no migration) → Task 1, 14 ✓
- Cadence trend phrasing ("losing momentum") → Task 4 (`cadencePhrase`) ✓
- Hashtag strategy binary → Task 4 prompt instructs "good if used, else poor" ✓
- Remove old 2-chart block + `CompetitorComparisonTable` → Task 11 ✓

**Post-spec additions (2026-04-13 user scope-add):**
- Confirm-platforms shows full scraped URLs → Task 13 ✓
- Missing-platform visual state (red input + "Not found" badge) → Task 13 ✓
- User-pasted competitor URLs override LLM discovery → Tasks 13, 14 ✓

**Type consistency:**
- `ScoreStatus` is `'good' | 'warning' | 'poor'` (matches existing enum — not `warn`) ✓
- `VideoAudit` defined in Task 3, imported by Task 2 tests and Task 4 — consistent ✓
- `BrandVideoAudits` defined in Task 4, used in Task 5 — consistent ✓
- Scorecard category strings match between enum (Task 1) and row definitions (Task 10) — use `platform_focus_account`, `bio_optimization_account`, `cta_intent_account` everywhere ✓

**Placeholder scan:** no TBD, no "handle edge cases", no vague validation — all steps show exact code.

**Open notes for the executor:**
1. Task 4's LLM prompt is long; if Claude returns items in a different shape than expected, the fallback is to surface the deterministic items. Fine.
2. Task 5 adds inline `runWithConcurrency`. If it clutters the route file, extract to `lib/audit/concurrency.ts` as a one-line follow-up.
3. The bio-optimization row is account-level but each platform has its own bio. The LLM picks the primary platform's bio (it has the full prompt context). If this proves inaccurate, add a helper in Task 2 later to pick by max-followers platform.
