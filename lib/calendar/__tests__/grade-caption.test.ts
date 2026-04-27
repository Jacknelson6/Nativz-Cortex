import { describe, expect, it } from 'vitest';
import { gradeCaption } from '../grade-caption';
import type { GeminiContext } from '@/lib/types/calendar';

const ctx: GeminiContext = {
  one_liner: 'Athlete demos kettlebell swing in a neon-lit gym',
  hook_seconds_0_3: 'Close-up of kettlebell hitting the floor',
  visual_themes: ['gym', 'kettlebells', 'strength', 'neon lighting'],
  audio_summary: 'Heavy bass beats with grunts',
  spoken_text_summary: '',
  mood: 'energetic',
  pacing: 'fast',
  recommended_caption_angle: 'lead with the brutal swing volume',
  key_moments: [{ t: 0.5, description: 'kettlebell impact' }],
};

const goodCaption =
  'Brutal kettlebell swings are non-negotiable in our morning sessions.\n\nReady to feel it tomorrow? Save this and try set one before breakfast.';

describe('gradeCaption', () => {
  it('rewards a tight, well-formed caption with relevant hashtags and a clear CTA', () => {
    const result = gradeCaption({
      caption: goodCaption,
      hashtags: ['gym', 'kettlebells', 'strength', 'fitness'],
      context: ctx,
      brandKeywords: ['kettlebell', 'strength'],
      brandVoice: 'energetic brutal no-nonsense motivating',
    });
    expect(result.total).toBeGreaterThanOrEqual(80);
    expect(result.body_length).toBeGreaterThanOrEqual(20);
    expect(result.cta_separation).toBeGreaterThanOrEqual(20);
    expect(result.hashtag_relevance).toBeGreaterThanOrEqual(15);
  });

  it('penalises captions that are too short', () => {
    const result = gradeCaption({
      caption: 'Lift heavy.',
      hashtags: ['gym'],
      context: ctx,
    });
    expect(result.body_length).toBeLessThan(15);
    expect(result.total).toBeLessThan(80);
  });

  it('penalises captions that are way too long', () => {
    const longCaption = 'lift '.repeat(200) + '\n\nFollow for more.';
    const result = gradeCaption({
      caption: longCaption,
      hashtags: ['gym', 'kettlebells', 'strength'],
      context: ctx,
    });
    expect(result.body_length).toBeLessThan(15);
  });

  it('penalises hashtag-only captions with no body or CTA', () => {
    const result = gradeCaption({
      caption: '#gym #kettlebells #strength',
      hashtags: ['gym', 'kettlebells', 'strength'],
      context: ctx,
    });
    expect(result.cta_separation).toBeLessThan(15);
    expect(result.total).toBeLessThan(80);
  });

  it('rewards relevant hashtags more than irrelevant ones', () => {
    const irrelevant = gradeCaption({
      caption: goodCaption,
      hashtags: ['cooking', 'travel', 'lifestyle'],
      context: ctx,
      brandKeywords: ['kettlebell', 'strength'],
    });
    const relevant = gradeCaption({
      caption: goodCaption,
      hashtags: ['kettlebell', 'strength', 'gym', 'fitness'],
      context: ctx,
      brandKeywords: ['kettlebell', 'strength'],
    });
    expect(relevant.hashtag_relevance).toBeGreaterThan(irrelevant.hashtag_relevance);
  });

  it('total never exceeds 100', () => {
    const result = gradeCaption({
      caption: goodCaption,
      hashtags: ['gym', 'kettlebells', 'strength', 'fitness', 'morning'],
      context: ctx,
      brandKeywords: ['kettlebell', 'strength', 'gym'],
      brandVoice: 'energetic brutal no-nonsense motivating',
    });
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('total is the sum of the four sub-scores', () => {
    const result = gradeCaption({
      caption: goodCaption,
      hashtags: ['gym', 'kettlebells', 'strength'],
      context: ctx,
      brandKeywords: ['kettlebell'],
      brandVoice: 'energetic brutal motivating',
    });
    expect(result.total).toBe(
      result.body_length + result.cta_separation + result.hashtag_relevance + result.voice_match,
    );
  });

  it('returns at least one reason explaining the score', () => {
    const result = gradeCaption({
      caption: 'Brutal swings.',
      hashtags: [],
      context: ctx,
    });
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('handles empty caption gracefully', () => {
    const result = gradeCaption({
      caption: '',
      hashtags: [],
      context: ctx,
    });
    expect(result.total).toBe(0);
    expect(result.body_length).toBe(0);
    expect(result.cta_separation).toBe(0);
    expect(result.hashtag_relevance).toBe(0);
    expect(result.voice_match).toBe(0);
  });

  it('rewards CTA verbs in the closing block', () => {
    const noCta = gradeCaption({
      caption:
        'Brutal kettlebell swings are non-negotiable in our morning sessions.\n\nThe heaviest set landed at sunrise yesterday.',
      hashtags: ['gym'],
      context: ctx,
    });
    const withCta = gradeCaption({
      caption:
        'Brutal kettlebell swings are non-negotiable in our morning sessions.\n\nReady to feel it tomorrow? Save this and try set one before breakfast.',
      hashtags: ['gym'],
      context: ctx,
    });
    expect(withCta.cta_separation).toBeGreaterThan(noCta.cta_separation);
  });

  it('rewards voice keyword overlap with brand voice description', () => {
    const noMatch = gradeCaption({
      caption: goodCaption,
      hashtags: ['gym', 'kettlebells'],
      context: ctx,
      brandVoice: 'corporate professional understated calm',
    });
    const match = gradeCaption({
      caption: goodCaption,
      hashtags: ['gym', 'kettlebells'],
      context: ctx,
      brandVoice: 'brutal energetic morning training',
    });
    expect(match.voice_match).toBeGreaterThan(noMatch.voice_match);
  });
});
