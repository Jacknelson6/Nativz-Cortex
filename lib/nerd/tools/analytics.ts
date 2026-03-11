import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const analyticsTools: ToolDefinition[] = [
  {
    name: 'get_analytics_summary',
    description: 'Get analytics summary for a specific client or across all clients. Returns views, engagement, follower changes for the specified period.',
    parameters: z.object({
      client_id: z.string().optional().describe('Client ID or slug. If omitted, returns aggregate across all clients.'),
      days: z.number().optional().describe('Number of days to look back. Default 30.'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const days = (params.days as number) || 30;
        const now = new Date();
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = now.toISOString().split('T')[0];

        let clientId = params.client_id as string | undefined;

        // Resolve slug to ID if needed
        if (clientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
          const { data: client } = await admin
            .from('clients')
            .select('id, name, slug')
            .eq('slug', clientId)
            .single();
          if (!client) return { success: false, error: `Client "${clientId}" not found` };
          clientId = client.id;
        }

        let query = admin
          .from('platform_snapshots')
          .select('*, social_profiles!inner(platform, username)')
          .gte('snapshot_date', start)
          .lte('snapshot_date', end);

        if (clientId) {
          query = query.eq('client_id', clientId);
        }

        const { data: snapshots, error } = await query;
        if (error) return { success: false, error: 'Failed to fetch analytics' };

        const rows = snapshots ?? [];
        const totalViews = rows.reduce((sum, s) => sum + (s.views_count ?? 0), 0);
        const totalEngagement = rows.reduce((sum, s) => sum + (s.engagement_count ?? 0), 0);
        const totalFollowerChange = rows.reduce((sum, s) => sum + (s.followers_change ?? 0), 0);

        // Group by platform
        const byPlatform: Record<string, { views: number; engagement: number; followerChange: number; count: number }> = {};
        for (const s of rows) {
          const profile = s.social_profiles as unknown as { platform: string; username: string };
          const platform = profile?.platform ?? 'unknown';
          if (!byPlatform[platform]) byPlatform[platform] = { views: 0, engagement: 0, followerChange: 0, count: 0 };
          byPlatform[platform].views += s.views_count ?? 0;
          byPlatform[platform].engagement += s.engagement_count ?? 0;
          byPlatform[platform].followerChange += s.followers_change ?? 0;
          byPlatform[platform].count++;
        }

        return {
          success: true,
          data: {
            period: `${start} to ${end}`,
            totalViews,
            totalEngagement,
            totalFollowerChange,
            snapshotCount: rows.length,
            byPlatform,
          },
          cardType: 'analytics' as const,
          link: clientId
            ? { href: '/admin/analytics', label: 'View analytics' }
            : { href: '/admin/analytics', label: 'View analytics' },
        };
      } catch {
        return { success: false, error: 'Failed to fetch analytics summary' };
      }
    },
  },
  {
    name: 'get_top_posts',
    description: 'Get top performing posts for a client based on engagement. Returns the highest-performing content.',
    parameters: z.object({
      client_id: z.string().describe('Client ID or slug'),
      days: z.number().optional().describe('Number of days to look back. Default 30.'),
      limit: z.number().optional().describe('Number of top posts to return. Default 5.'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const days = (params.days as number) || 30;
        const limit = (params.limit as number) || 5;
        let clientId = params.client_id as string;

        // Resolve slug to ID
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
          const { data: client } = await admin
            .from('clients')
            .select('id')
            .eq('slug', clientId)
            .single();
          if (!client) return { success: false, error: `Client "${clientId}" not found` };
          clientId = client.id;
        }

        const now = new Date();
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = now.toISOString().split('T')[0];

        const { data: posts, error } = await admin
          .from('post_metrics')
          .select('*, social_profiles!inner(username, platform)')
          .eq('client_id', clientId)
          .gte('published_at', start)
          .lte('published_at', end);

        if (error) return { success: false, error: 'Failed to fetch post metrics' };

        const ranked = (posts ?? [])
          .map((post) => {
            const profile = post.social_profiles as unknown as { username: string; platform: string };
            const totalEngagement = (post.likes_count ?? 0) + (post.comments_count ?? 0) + (post.shares_count ?? 0) + (post.saves_count ?? 0);
            return {
              platform: profile?.platform ?? '',
              username: profile?.username ?? '',
              caption: post.caption ? (post.caption as string).slice(0, 100) : null,
              views: post.views_count ?? 0,
              likes: post.likes_count ?? 0,
              comments: post.comments_count ?? 0,
              shares: post.shares_count ?? 0,
              totalEngagement,
              postUrl: post.post_url ?? null,
              publishedAt: post.published_at,
            };
          })
          .sort((a, b) => b.totalEngagement - a.totalEngagement)
          .slice(0, limit);

        return {
          success: true,
          data: { posts: ranked, period: `${start} to ${end}` },
          cardType: 'analytics' as const,
        };
      } catch {
        return { success: false, error: 'Failed to fetch top posts' };
      }
    },
  },
  {
    name: 'compare_client_performance',
    description: 'Compare analytics performance between two clients side by side.',
    parameters: z.object({
      client_id_a: z.string().describe('First client ID or slug'),
      client_id_b: z.string().describe('Second client ID or slug'),
      days: z.number().optional().describe('Number of days to look back. Default 30.'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const days = (params.days as number) || 30;
        const now = new Date();
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = now.toISOString().split('T')[0];

        async function resolveAndFetch(idOrSlug: string) {
          let clientId = idOrSlug;
          let clientName = idOrSlug;

          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)) {
            const { data: client } = await admin
              .from('clients')
              .select('id, name')
              .eq('slug', idOrSlug)
              .single();
            if (!client) return null;
            clientId = client.id;
            clientName = client.name;
          } else {
            const { data: client } = await admin
              .from('clients')
              .select('name')
              .eq('id', idOrSlug)
              .single();
            if (client) clientName = client.name;
          }

          const { data: snapshots } = await admin
            .from('platform_snapshots')
            .select('views_count, engagement_count, followers_change')
            .eq('client_id', clientId)
            .gte('snapshot_date', start)
            .lte('snapshot_date', end);

          const rows = snapshots ?? [];
          return {
            name: clientName,
            totalViews: rows.reduce((sum, s) => sum + (s.views_count ?? 0), 0),
            totalEngagement: rows.reduce((sum, s) => sum + (s.engagement_count ?? 0), 0),
            totalFollowerChange: rows.reduce((sum, s) => sum + (s.followers_change ?? 0), 0),
            snapshotCount: rows.length,
          };
        }

        const [a, b] = await Promise.all([
          resolveAndFetch(params.client_id_a as string),
          resolveAndFetch(params.client_id_b as string),
        ]);

        if (!a) return { success: false, error: `Client "${params.client_id_a}" not found` };
        if (!b) return { success: false, error: `Client "${params.client_id_b}" not found` };

        return {
          success: true,
          data: { clientA: a, clientB: b, period: `${start} to ${end}` },
          cardType: 'analytics' as const,
        };
      } catch {
        return { success: false, error: 'Failed to compare client performance' };
      }
    },
  },
];
