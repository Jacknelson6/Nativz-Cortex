import { z } from 'zod';

export const plannerOutputSchema = z.object({
  subtopics: z.array(z.string().min(1).max(200)).min(1).max(15),
});

export const subtopicReportSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  note: z.string().optional(),
});

export const subtopicReportSchema = z.object({
  subtopic: z.string(),
  findings: z.array(z.string()).min(1),
  themes: z.array(z.string()).optional(),
  sources: z.array(subtopicReportSourceSchema).default([]),
  open_questions: z.array(z.string()).optional(),
});

export const mergerTopicItemSchema = z.object({
  name: z.string(),
  why_trending: z.string(),
  platforms_seen: z.array(z.string()),
  posts_overview: z.string(),
  comments_overview: z.string(),
  /** Must be subset of tool-discovered URLs */
  source_urls: z.array(z.string()).optional(),
  video_ideas: z
    .array(
      z.object({
        title: z.string(),
        hook: z.string().optional(),
        description: z.string().optional(),
        format: z.string().optional(),
        virality: z.enum(['viral_potential', 'high', 'medium', 'low']).optional(),
        why_it_works: z.string().optional(),
      }),
    )
    .optional(),
  resonance: z.enum(['low', 'medium', 'high', 'viral']).optional(),
  sentiment: z.number().min(-1).max(1).optional(),
  estimated_engagement: z.number().optional(),
});

export const mergerEmotionSchema = z.object({
  emotion: z.string(),
  percentage: z.number(),
  color: z.string(),
  /** One-sentence content strategy insight specific to why this emotion appears for this topic. */
  subtext: z.string().optional(),
});

export const mergerContentBreakdownItemSchema = z.object({
  name: z.string(),
  percentage: z.number(),
  engagement_rate: z.number(),
  your_engagement_rate: z.number().optional(),
});

export const mergerPlatformBreakdownItemSchema = z.object({
  platform: z.string(),
  post_count: z.number(),
  comment_count: z.number(),
  avg_sentiment: z.number(),
});

export const mergerOutputSchema = z.object({
  summary: z.string(),
  brand_alignment_notes: z.string().optional(),
  overall_sentiment: z.number().min(-1).max(1),
  conversation_intensity: z.enum(['low', 'moderate', 'high', 'very_high']),
  topics: z.array(mergerTopicItemSchema).min(1).max(15),
  emotions: z.array(mergerEmotionSchema).optional(),
  content_breakdown: z.object({
    intentions: z.array(mergerContentBreakdownItemSchema),
    categories: z.array(mergerContentBreakdownItemSchema),
    formats: z.array(mergerContentBreakdownItemSchema),
  }).optional(),
  platform_breakdown: z.array(mergerPlatformBreakdownItemSchema).optional(),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
export type SubtopicReport = z.infer<typeof subtopicReportSchema>;
export type MergerOutput = z.infer<typeof mergerOutputSchema>;
