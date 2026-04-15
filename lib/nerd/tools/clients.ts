import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const clientTools: ToolDefinition[] = [
  // ── get_client_details ────────────────────────────────────
  {
    name: 'get_client_details',
    description:
      'Get full details for a client including social profiles, latest strategy, and contacts. Accepts a UUID or slug.',
    parameters: z.object({
      client_id: z.string(),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();
        const clientId = params.client_id as string;
        const isUuid = UUID_RE.test(clientId);

        // Fetch client
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq(isUuid ? 'id' : 'slug', clientId)
          .single();

        if (clientError) {
          return { success: false, error: `Client not found: ${clientError.message}` };
        }

        // Tenant isolation, impersonation-aware. A real admin passes
        // through. A real viewer OR an admin currently impersonating a
        // client can only see the clients in their effective clientIds
        // — strict client-id match, because orgs can host multiple
        // brands (Avondale + Landshark share one org) and scoping by
        // organization_id would leak sibling brands to the AI.
        const ctx = await getEffectiveAccessContext(userId, supabase);
        if (ctx.role !== 'admin') {
          if (!ctx.clientIds || !ctx.clientIds.includes(client.id as string)) {
            return { success: false, error: 'Client not found' };
          }
        }

        // Fetch social profiles, latest completed strategy, and contacts in parallel
        const [profilesRes, strategyRes, contactsRes] = await Promise.all([
          supabase
            .from('social_profiles')
            .select('id, platform, username, is_active')
            .eq('client_id', client.id),
          supabase
            .from('client_strategies')
            .select('executive_summary, content_pillars, status')
            .eq('client_id', client.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('contacts')
            .select('id, full_name, email, phone, role, is_primary')
            .eq('client_id', client.id)
            .order('is_primary', { ascending: false })
            .order('full_name', { ascending: true }),
        ]);

        return {
          success: true,
          data: {
            ...client,
            social_profiles: profilesRes.data ?? [],
            strategy: strategyRes.data ?? null,
            contacts: contactsRes.data ?? [],
          },
          cardType: 'client' as const,
          link: {
            href: `/admin/clients/${client.slug}`,
            label: 'View client',
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch client details',
        };
      }
    },
  },

  // ── update_client_settings ────────────────────────────────
  {
    name: 'update_client_settings',
    description:
      'Update a client\'s settings such as brand voice, target audience, industry, description, services, or preferences. Only provided fields are changed.',
    parameters: z.object({
      client_id: z.string(),
      brand_voice: z.string().optional(),
      target_audience: z.string().optional(),
      industry: z.string().optional(),
      description: z.string().optional(),
      services: z.array(z.string()).optional(),
      preferences: z
        .object({
          posting_frequency: z.string().optional(),
          tone_keywords: z.array(z.string()).optional(),
          topics_lean_into: z.array(z.string()).optional(),
          topics_avoid: z.array(z.string()).optional(),
          content_types: z.array(z.string()).optional(),
          boosting_budget: z.number().optional(),
        })
        .optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const clientId = params.client_id as string;
        const isUuid = UUID_RE.test(clientId);

        // Build updates from provided fields only
        const updates: Record<string, unknown> = {};
        if (params.brand_voice !== undefined) updates.brand_voice = params.brand_voice;
        if (params.target_audience !== undefined) updates.target_audience = params.target_audience;
        if (params.industry !== undefined) updates.industry = params.industry;
        if (params.description !== undefined) updates.description = params.description;
        if (params.services !== undefined) updates.services = params.services;
        if (params.preferences !== undefined) updates.preferences = params.preferences;

        if (Object.keys(updates).length === 0) {
          return { success: false, error: 'No fields provided to update' };
        }

        let query = supabase.from('clients').update(updates);
        query = isUuid ? query.eq('id', clientId) : query.eq('slug', clientId);

        const { data, error } = await query.select().single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data,
          cardType: 'client' as const,
          link: {
            href: `/admin/clients/${data.slug}`,
            label: 'View client',
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update client settings',
        };
      }
    },
  },

  // ── list_client_contacts ──────────────────────────────────
  {
    name: 'list_client_contacts',
    description:
      'List all contacts for a client, ordered by primary contact first then alphabetically.',
    parameters: z.object({
      client_id: z.string(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const clientId = params.client_id as string;

        const { data, error } = await supabase
          .from('contacts')
          .select('id, full_name, email, phone, role, is_primary')
          .eq('client_id', clientId)
          .order('is_primary', { ascending: false })
          .order('full_name', { ascending: true });

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data: data ?? [],
          cardType: 'client' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list contacts',
        };
      }
    },
  },

  // ── add_client_contact ────────────────────────────────────
  {
    name: 'add_client_contact',
    description:
      'Add a new contact to a client. Optionally mark them as the primary contact.',
    parameters: z.object({
      client_id: z.string(),
      full_name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      role: z.string().optional(),
      is_primary: z.boolean().optional().default(false),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const clientId = params.client_id as string;

        const { data, error } = await supabase
          .from('contacts')
          .insert({
            client_id: clientId,
            full_name: params.full_name as string,
            email: (params.email as string) ?? null,
            phone: (params.phone as string) ?? null,
            role: (params.role as string) ?? null,
            is_primary: (params.is_primary as boolean) ?? false,
          })
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        // Look up client slug for the link
        const { data: client } = await supabase
          .from('clients')
          .select('slug')
          .eq('id', clientId)
          .single();

        return {
          success: true,
          data,
          cardType: 'client' as const,
          link: client
            ? { href: `/admin/clients/${client.slug}`, label: 'View client' }
            : undefined,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to add contact',
        };
      }
    },
  },

  // ── get_client_analytics ──────────────────────────────────
  {
    name: 'get_client_analytics',
    description:
      'Get aggregated analytics for a client over a given number of days. Returns totals for views, engagement, and follower change by platform.',
    parameters: z.object({
      client_id: z.string(),
      days: z.number().optional().default(30),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const clientId = params.client_id as string;
        const days = (params.days as number) ?? 30;

        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceISO = since.toISOString().split('T')[0];

        // Fetch social profiles for this client
        const { data: profiles, error: profilesError } = await supabase
          .from('social_profiles')
          .select('id, platform, username')
          .eq('client_id', clientId);

        if (profilesError) {
          return { success: false, error: profilesError.message };
        }

        if (!profiles || profiles.length === 0) {
          return {
            success: true,
            data: { message: 'No social profiles found for this client', platforms: [] },
            cardType: 'analytics' as const,
          };
        }

        const profileIds = profiles.map((p) => p.id);

        // Fetch snapshots within date range
        const { data: snapshots, error: snapshotsError } = await supabase
          .from('platform_snapshots')
          .select('social_profile_id, views, engagement, follower_count, snapshot_date')
          .in('social_profile_id', profileIds)
          .gte('snapshot_date', sinceISO)
          .order('snapshot_date', { ascending: true });

        if (snapshotsError) {
          return { success: false, error: snapshotsError.message };
        }

        // Build a lookup from profile id to platform info
        const profileMap = new Map(profiles.map((p) => [p.id, p]));

        // Aggregate by platform
        const platformTotals: Record<
          string,
          { platform: string; username: string; views: number; engagement: number; follower_change: number }
        > = {};

        for (const snap of snapshots ?? []) {
          const profile = profileMap.get(snap.social_profile_id);
          if (!profile) continue;

          if (!platformTotals[profile.platform]) {
            platformTotals[profile.platform] = {
              platform: profile.platform,
              username: profile.username,
              views: 0,
              engagement: 0,
              follower_change: 0,
            };
          }

          platformTotals[profile.platform].views += snap.views ?? 0;
          platformTotals[profile.platform].engagement += snap.engagement ?? 0;
        }

        // Calculate follower change (latest - earliest per profile)
        for (const profileId of profileIds) {
          const profileSnaps = (snapshots ?? []).filter(
            (s) => s.social_profile_id === profileId
          );
          if (profileSnaps.length < 2) continue;

          const profile = profileMap.get(profileId);
          if (!profile || !platformTotals[profile.platform]) continue;

          const earliest = profileSnaps[0].follower_count ?? 0;
          const latest = profileSnaps[profileSnaps.length - 1].follower_count ?? 0;
          platformTotals[profile.platform].follower_change += latest - earliest;
        }

        const platforms = Object.values(platformTotals);
        const totalViews = platforms.reduce((sum, p) => sum + p.views, 0);
        const totalEngagement = platforms.reduce((sum, p) => sum + p.engagement, 0);
        const totalFollowerChange = platforms.reduce((sum, p) => sum + p.follower_change, 0);

        // Look up client slug for the link
        const { data: client } = await supabase
          .from('clients')
          .select('slug')
          .eq('id', clientId)
          .single();

        return {
          success: true,
          data: {
            days,
            total_views: totalViews,
            total_engagement: totalEngagement,
            total_follower_change: totalFollowerChange,
            platforms,
          },
          cardType: 'analytics' as const,
          link: client
            ? { href: `/admin/clients/${client.slug}`, label: 'View client' }
            : undefined,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch client analytics',
        };
      }
    },
  },
];
