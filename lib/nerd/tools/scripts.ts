/**
 * Scripting tools for the Nerd — turn a video idea (raw title + reasons +
 * pillar) into a full spoken-word script using the canonical pipeline at
 * `lib/ideas/spoken-script.ts` (same path `POST /api/ideas/generate-script`
 * uses). Persists the output to `idea_scripts` so the script shows up
 * wherever that table is surfaced.
 *
 * Separate from `generate_video_rescript` — that tool rescripts an EXISTING
 * moodboard_item (you need hook_analysis + transcript already loaded). This
 * tool kicks off a fresh script from a raw idea, which is the Strategy Lab
 * primary flow: /ideas → pick one → /script on it.
 */

import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateSpokenScript } from '@/lib/ideas/spoken-script';

const HOOK_STRATEGIES = [
  'negative',
  'curiosity',
  'controversial',
  'story',
  'authority',
  'question',
  'listicle',
  'fomo',
  'tutorial',
] as const;

export const scriptTools: ToolDefinition[] = [
  {
    name: 'script_video_idea',
    description:
      'Turn a raw video idea into a full spoken-word script using Nativz\'s scripting pipeline. Use this when the user has an idea title + concept and wants a performable script (not a rescript of an existing video — use generate_video_rescript for that). Pulls the client\'s brand voice, target audience, and any reference videos you pass. Saves the result to idea_scripts so it\'s retrievable later.',
    // Keep this schema composed from primitive Zod types only — no z.union,
    // no nested composed modifiers — because OpenAI's strict function-call
    // validator rejects property-level `anyOf`, which is what Zod v4's
    // z.toJSONSchema emits for union types. Breaking that contract takes
    // down the WHOLE tool list (the first bad tool fails the request), and
    // that's exactly the regression that caused the Nerd chat to error with
    // "Invalid schema for function" right after this tool landed.
    parameters: z.object({
      client_id: z.string().describe('Client UUID for brand context (required)'),
      title: z.string().describe('Video idea title or headline'),
      why_it_works: z
        .array(z.string())
        .optional()
        .describe('Reason bullets explaining why this idea resonates — pulled from /ideas output or the topic search. Single-reason inputs should still be passed as a 1-element array.'),
      content_pillar: z.string().optional().describe('Content pillar or category this idea lives under'),
      reference_video_ids: z
        .array(z.string())
        .optional()
        .describe('reference_videos UUIDs to match style, pacing, and tone from past winners for this client'),
      cta: z.string().optional().describe('Specific CTA to close the script (defaults to brand-appropriate)'),
      video_length_seconds: z
        .number()
        .optional()
        .describe('Target video length in seconds. Default 60, valid range 10-180. Drives word count at ~130 wpm.'),
      hook_strategies: z
        .array(z.string())
        .optional()
        .describe('Hook styles to blend. Valid values: negative, curiosity, controversial, story, authority, question, listicle, fomo, tutorial'),
      notes: z.string().optional().describe('Any extra framing the user wants the script to reflect'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data: profile } = await admin.from('users').select('email').eq('id', userId).single();

        const clientId = params.client_id as string;
        const title = params.title as string;

        const result = await generateSpokenScript({
          admin,
          clientId,
          title,
          why_it_works: params.why_it_works as string | string[] | undefined,
          content_pillar: params.content_pillar as string | undefined,
          reference_video_ids: params.reference_video_ids as string[] | undefined,
          cta: params.cta as string | undefined,
          video_length_seconds: params.video_length_seconds as number | undefined,
          hook_strategies: params.hook_strategies as string[] | undefined,
          userId,
          userEmail: profile?.email ?? undefined,
        });

        // Persist so the script is retrievable from /lab and the
        // rest of the ideas pipeline, same shape the /api/ideas/generate-script
        // route saves.
        const { data: saved } = await admin
          .from('idea_scripts')
          .insert({
            idea_entry_id: null,
            client_id: clientId,
            title,
            script_text: result.scriptText,
            reference_context: {
              reference_video_ids: (params.reference_video_ids as string[] | undefined) ?? [],
              why_it_works: (params.why_it_works as string | string[] | undefined) ?? null,
              content_pillar: (params.content_pillar as string | undefined) ?? null,
              hook_strategies: (params.hook_strategies as string[] | undefined) ?? null,
              source: 'nerd_script_video_idea_tool',
              notes: (params.notes as string | undefined) ?? null,
            },
          })
          .select('id')
          .maybeSingle();

        return {
          success: true,
          data: {
            title,
            script: result.scriptText,
            scriptId: saved?.id ?? null,
            estimatedCost: result.estimatedCost,
          },
          link: { href: '/lab', label: 'Open Strategy Lab' },
          cardType: 'script' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Script generation failed',
        };
      }
    },
  },
];
