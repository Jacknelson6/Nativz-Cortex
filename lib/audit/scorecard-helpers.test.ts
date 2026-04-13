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
  it('returns up to 3 poor items where at least one competitor is good (no goals)', () => {
    const sc = { overallScore: 40, items: [
      mkItem('posting_frequency', 'poor', 'good'),
      mkItem('hook_consistency', 'poor', 'good', 'good'),
      mkItem('cta_intent_account', 'poor', 'good'),
      mkItem('bio_optimization_account', 'poor', 'warning'),
      mkItem('engagement_rate', 'good', 'poor'),
    ], summary: '' };
    // All three base-weighted items score 1.5 — they should all be in the top 3
    const gaps = rankCompetitorGaps(sc);
    expect(gaps.map(g => g.category)).toHaveLength(3);
    expect(gaps.map(g => g.category)).toEqual(
      expect.arrayContaining(['posting_frequency', 'hook_consistency', 'cta_intent_account']),
    );
  });
  it('returns empty when prospect leads everywhere', () => {
    const sc = { overallScore: 95, items: [mkItem('posting_frequency', 'good', 'poor')], summary: '' };
    expect(rankCompetitorGaps(sc)).toEqual([]);
  });
  it('engagement_rate ranks first when "Go viral and maximize engagement" goal is set', () => {
    // engagement_rate: base 1 + boost 3 = 4
    // posting_frequency: base 1.5 + boost 0 = 1.5
    // avg_views: base 1 + boost 0 = 1
    const sc = { overallScore: 40, items: [
      mkItem('posting_frequency', 'poor', 'good'),
      mkItem('engagement_rate', 'poor', 'good'),
      mkItem('avg_views', 'poor', 'good'),
    ], summary: '' };
    const gaps = rankCompetitorGaps(sc, ['Go viral and maximize engagement']);
    expect(gaps[0].category).toBe('engagement_rate');
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
