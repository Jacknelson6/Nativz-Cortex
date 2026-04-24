import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const schedulerTools: ToolDefinition[] = [
  // ── list_scheduled_posts ─────────────────────────────────────────────
  {
    name: 'list_scheduled_posts',
    description:
      'List scheduled social-media posts, optionally filtered by client and/or status.',
    parameters: z.object({
      client_id: z.string().optional(),
      status: z
        .enum(['draft', 'scheduled', 'published', 'failed'])
        .optional(),
      limit: z.number().optional().default(10),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { client_id, status, limit = 10 } = params as {
          client_id?: string;
          status?: string;
          limit?: number;
        };

        let query = supabase
          .from('scheduled_posts')
          .select(
            `
            *,
            scheduled_post_platforms (
              social_profile_id,
              status,
              social_profiles ( id, platform, username )
            )
          `,
          )
          .order('scheduled_at', { ascending: true })
          .limit(limit);

        if (client_id) query = query.eq('client_id', client_id);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;

        if (error) {
          return { success: false, error: error.message, cardType: 'post' as const };
        }

        const posts = (data ?? []).map((post) => {
          const platforms = (
            (post.scheduled_post_platforms as Array<{
              social_profile_id: string;
              status: string;
              social_profiles: { id: string; platform: string; username: string } | null;
            }>) ?? []
          ).map((pp) => ({
            profile_id: pp.social_profile_id,
            status: pp.status,
            platform: pp.social_profiles?.platform ?? null,
            username: pp.social_profiles?.username ?? null,
          }));

          return {
            id: post.id,
            client_id: post.client_id,
            caption: post.caption,
            hashtags: post.hashtags ?? [],
            scheduled_at: post.scheduled_at,
            status: post.status,
            cover_image_url: post.cover_image_url,
            late_post_id: post.late_post_id,
            created_by: post.created_by,
            platforms,
          };
        });

        return { success: true, data: posts, cardType: 'post' as const };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          cardType: 'post' as const,
        };
      }
    },
  },

  // ── create_post ──────────────────────────────────────────────────────
  {
    name: 'create_post',
    description:
      'Create a new scheduled post (draft or scheduled) and optionally assign platforms.',
    parameters: z.object({
      client_id: z.string(),
      caption: z.string(),
      hashtags: z.array(z.string()).optional(),
      scheduled_at: z.string().optional(),
      status: z.enum(['draft', 'scheduled']).optional().default('draft'),
      platform_profile_ids: z.array(z.string()).optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();
        const {
          client_id,
          caption,
          hashtags,
          scheduled_at,
          status = 'draft',
          platform_profile_ids,
        } = params as {
          client_id: string;
          caption: string;
          hashtags?: string[];
          scheduled_at?: string;
          status?: 'draft' | 'scheduled';
          platform_profile_ids?: string[];
        };

        const { data: post, error } = await supabase
          .from('scheduled_posts')
          .insert({
            client_id,
            caption,
            hashtags: hashtags ?? [],
            scheduled_at: scheduled_at ?? null,
            status,
            created_by: userId,
          })
          .select()
          .single();

        if (error || !post) {
          return {
            success: false,
            error: error?.message ?? 'Failed to create post',
            cardType: 'post' as const,
          };
        }

        // Assign platforms if provided
        if (platform_profile_ids && platform_profile_ids.length > 0) {
          const rows = platform_profile_ids.map((profileId) => ({
            post_id: post.id,
            social_profile_id: profileId,
            status: 'pending',
          }));

          const { error: platformError } = await supabase
            .from('scheduled_post_platforms')
            .insert(rows);

          if (platformError) {
            return {
              success: false,
              error: `Post created but platform assignment failed: ${platformError.message}`,
              data: post,
              cardType: 'post' as const,
              link: { href: '/admin/scheduling', label: 'View scheduler' },
            };
          }
        }

        return {
          success: true,
          data: post,
          cardType: 'post' as const,
          link: { href: '/admin/scheduling', label: 'View scheduler' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          cardType: 'post' as const,
        };
      }
    },
  },

  // ── update_post ──────────────────────────────────────────────────────
  {
    name: 'update_post',
    description:
      'Update an existing scheduled post (caption, hashtags, schedule time, or status).',
    parameters: z.object({
      post_id: z.string(),
      caption: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      scheduled_at: z.string().optional(),
      status: z.enum(['draft', 'scheduled']).optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { post_id, caption, hashtags, scheduled_at, status } = params as {
          post_id: string;
          caption?: string;
          hashtags?: string[];
          scheduled_at?: string;
          status?: 'draft' | 'scheduled';
        };

        const updates: Record<string, unknown> = {};
        if (caption !== undefined) updates.caption = caption;
        if (hashtags !== undefined) updates.hashtags = hashtags;
        if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
        if (status !== undefined) updates.status = status;

        if (Object.keys(updates).length === 0) {
          return {
            success: false,
            error: 'No fields to update',
            cardType: 'post' as const,
          };
        }

        const { data: post, error } = await supabase
          .from('scheduled_posts')
          .update(updates)
          .eq('id', post_id)
          .select()
          .single();

        if (error || !post) {
          return {
            success: false,
            error: error?.message ?? 'Post not found',
            cardType: 'post' as const,
          };
        }

        return {
          success: true,
          data: post,
          cardType: 'post' as const,
          link: { href: '/admin/scheduling', label: 'View scheduler' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          cardType: 'post' as const,
        };
      }
    },
  },

  // ── delete_post ──────────────────────────────────────────────────────
  {
    name: 'delete_post',
    description: 'Delete a scheduled post. (Restricted — requires manual action.)',
    parameters: z.object({
      post_id: z.string(),
    }),
    riskLevel: 'destructive',
    handler: async () => {
      return {
        success: false,
        error: 'For safety, posts must be deleted manually.',
        cardType: 'post' as const,
        link: { href: '/admin/scheduling', label: 'Open scheduler' },
      };
    },
  },
];
