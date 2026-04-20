import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientProfileToVault, removeClientFromVault } from '@/lib/vault/sync';
import { logActivity } from '@/lib/activity';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';
import {
  normalizeAdminWorkspaceModules,
  parseFullAdminWorkspaceModulesForPatch,
} from '@/lib/clients/admin-workspace-modules';
import { isValidIanaTimeZone } from '@/lib/affiliates/digest-schedule';

/**
 * GET /api/clients/[id]
 *
 * Fetch a single client's full profile including portal contacts and strategy.
 * Supports lookup by UUID or slug.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID or slug
 * @returns {{ client: Client, portalContacts: User[], strategy: ClientStrategy | null }}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Effective-access aware: real viewers are scoped to their own org;
    // admins impersonating are scoped to the impersonated client's org.
    const ctx = await getEffectiveAccessContext(user, adminClient);

    // Fetch client — support both UUID (id) and slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { data: dbClient } = await adminClient
      .from('clients')
      .select(
        'id, name, slug, industry, organization_id, logo_url, website_url, target_audience, brand_voice, topic_keywords, is_active, feature_flags, health_score, agency, services, description, google_drive_branding_url, google_drive_calendars_url, preferences, monthly_boosting_budget, uppromote_api_key, affiliate_digest_email_enabled, affiliate_digest_recipients, affiliate_digest_timezone, affiliate_digest_send_day_of_week, affiliate_digest_send_hour, affiliate_digest_send_minute, affiliate_digest_last_sent_week_key, social_digest_email_enabled, social_digest_recipients, social_digest_timezone, social_digest_send_day_of_week, social_digest_send_hour, social_digest_send_minute, social_digest_last_sent_week_key, admin_workspace_modules',
      )
      .eq(isUuid ? 'id' : 'slug', id)
      .single();

    if (!dbClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    if (ctx.role === 'viewer') {
      // Strict client-id match. Orgs can host multiple brands (e.g.
      // Avondale + Landshark share one organization_id) — scoping by
      // organization_id would leak sibling brands.
      const inScope = ctx.clientIds?.includes(dbClient.id as string) ?? false;
      if (!inScope) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const clientId = dbClient.id;

    // Fetch portal contacts for THIS specific client (not the whole org)
    const [contactsResult, { data: strategyData }] = await Promise.all([
      (async () => {
        // Get user IDs with explicit access to this client
        const { data: accessRows } = await adminClient
          .from('user_client_access')
          .select('user_id')
          .eq('client_id', clientId);

        const userIds = (accessRows ?? []).map((r) => r.user_id);
        if (userIds.length === 0) {
          return { data: [] as Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }> };
        }

        return adminClient
          .from('users')
          .select('id, full_name, email, avatar_url, job_title, last_login')
          .in('id', userIds)
          .eq('role', 'viewer')
          .order('full_name');
      })(),
      adminClient
        .from('client_strategies')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // "isAdmin" here means "allowed to see admin-only fields"; during
    // impersonation we intentionally drop back to viewer-visibility so
    // the admin experiences exactly what the client sees.
    const isAdmin = ctx.role === 'admin';
    const row = dbClient as {
      uppromote_api_key?: string | null;
      affiliate_digest_email_enabled?: boolean | null;
      affiliate_digest_recipients?: string | null;
      affiliate_digest_timezone?: string | null;
      affiliate_digest_send_day_of_week?: number | null;
      affiliate_digest_send_hour?: number | null;
      affiliate_digest_send_minute?: number | null;
      affiliate_digest_last_sent_week_key?: string | null;
      social_digest_email_enabled?: boolean | null;
      social_digest_recipients?: string | null;
      social_digest_timezone?: string | null;
      social_digest_send_day_of_week?: number | null;
      social_digest_send_hour?: number | null;
      social_digest_send_minute?: number | null;
      social_digest_last_sent_week_key?: string | null;
    };

    return NextResponse.json({
      client: {
        id: dbClient.id,
        name: dbClient.name ?? id,
        slug: dbClient.slug,
        industry: dbClient.industry,
        logo_url: dbClient.logo_url || null,
        website_url: dbClient.website_url || null,
        target_audience: dbClient.target_audience || null,
        brand_voice: dbClient.brand_voice || null,
        topic_keywords: (dbClient.topic_keywords as string[]) || null,
        is_active: dbClient.is_active,
        feature_flags: dbClient.feature_flags || null,
        health_score: (dbClient as { health_score?: string | null }).health_score ?? null,
        agency: dbClient.agency ?? null,
        services: (dbClient.services as string[]) ?? null,
        description: dbClient.description ?? null,
        google_drive_branding_url: dbClient.google_drive_branding_url ?? null,
        google_drive_calendars_url: dbClient.google_drive_calendars_url ?? null,
        preferences: dbClient.preferences ?? null,
        monthly_boosting_budget: (dbClient as { monthly_boosting_budget?: number | null }).monthly_boosting_budget ?? null,
        has_affiliate_integration: isAdmin ? Boolean(row.uppromote_api_key) : undefined,
        affiliate_digest_email_enabled: isAdmin ? Boolean(row.affiliate_digest_email_enabled) : undefined,
        affiliate_digest_recipients: isAdmin ? (row.affiliate_digest_recipients ?? null) : undefined,
        affiliate_digest_timezone: isAdmin ? (row.affiliate_digest_timezone ?? 'UTC') : undefined,
        affiliate_digest_send_day_of_week: isAdmin
          ? (row.affiliate_digest_send_day_of_week ?? 3)
          : undefined,
        affiliate_digest_send_hour: isAdmin ? (row.affiliate_digest_send_hour ?? 14) : undefined,
        affiliate_digest_send_minute: isAdmin ? (row.affiliate_digest_send_minute ?? 0) : undefined,
        affiliate_digest_last_sent_week_key: isAdmin
          ? (row.affiliate_digest_last_sent_week_key ?? null)
          : undefined,
        social_digest_email_enabled: isAdmin
          ? Boolean(row.social_digest_email_enabled)
          : undefined,
        social_digest_recipients: isAdmin
          ? (row.social_digest_recipients ?? null)
          : undefined,
        social_digest_timezone: isAdmin
          ? (row.social_digest_timezone ?? 'America/Los_Angeles')
          : undefined,
        social_digest_send_day_of_week: isAdmin
          ? (row.social_digest_send_day_of_week ?? 1)
          : undefined,
        social_digest_send_hour: isAdmin ? (row.social_digest_send_hour ?? 9) : undefined,
        social_digest_send_minute: isAdmin ? (row.social_digest_send_minute ?? 0) : undefined,
        social_digest_last_sent_week_key: isAdmin
          ? (row.social_digest_last_sent_week_key ?? null)
          : undefined,
        admin_workspace_modules: isAdmin
          ? normalizeAdminWorkspaceModules(
              (dbClient as { admin_workspace_modules?: unknown }).admin_workspace_modules,
            )
          : undefined,
      },
      portalContacts: contactsResult.data || [],
      strategy: strategyData ?? null,
    });
  } catch (error) {
    console.error('GET /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/clients/[id]
 *
 * Update allowed client fields. After update, syncs the client profile to the Obsidian vault
 * (non-blocking). Only a specific whitelist of fields can be updated.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body industry - Updated industry
 * @body target_audience - Updated target audience description
 * @body brand_voice - Updated brand voice description
 * @body topic_keywords - Updated topic keywords array
 * @body feature_flags - Updated feature flag object
 * @body is_active - Active/inactive status
 * @body logo_url - Updated logo URL
 * @body website_url - Updated website URL
 * @body description - Client description
 * @body services - Array of service strings
 * @body health_score - Health score value
 * @body agency - Agency name
 * @body google_drive_branding_url - Google Drive branding folder URL
 * @body google_drive_calendars_url - Google Drive calendars folder URL
 * @body monthly_boosting_budget - Monthly ad boosting budget
 * @body preferences - Client preferences object
 * @returns {Client} Updated client record
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const ctx = await getEffectiveAccessContext(user, adminClient);
    const isAdmin = ctx.role === 'admin';

    // Portal users + impersonating admins: verify org ownership. The
    // impersonation path lands here too because ctx downgrades the admin
    // role — they're limited to the impersonated client's org.
    if (!isAdmin) {
      const { data: clientRow } = await adminClient
        .from('clients')
        .select('organization_id')
        .eq('id', id)
        .single();

      // Strict client-id match — see GET for the multi-brand-org rationale.
      const inScope = !!clientRow && (ctx.clientIds?.includes(id) ?? false);
      if (!inScope) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const body = await request.json();

    let existingFeatureFlags: Record<string, unknown> = {};
    if ('feature_flags' in body) {
      const { data: curRow } = await adminClient.from('clients').select('feature_flags').eq('id', id).single();
      existingFeatureFlags = (curRow?.feature_flags as Record<string, unknown>) ?? {};
    }

    // Portal users can only update brand profile fields
    const portalAllowedFields = [
      'industry',
      'target_audience',
      'brand_voice',
      'topic_keywords',
    ];

    const allowedFields = isAdmin
      ? [
          ...portalAllowedFields,
          'feature_flags',
          'is_active',
          'description',
          'category',
          'logo_url',
          'website_url',
          'preferences',
          'services',
          'health_score_override',
          'health_score',
          'agency',
          'google_drive_branding_url',
          'google_drive_calendars_url',
          'monthly_boosting_budget',
          'affiliate_digest_email_enabled',
          'affiliate_digest_recipients',
          'affiliate_digest_timezone',
          'affiliate_digest_send_day_of_week',
          'affiliate_digest_send_hour',
          'affiliate_digest_send_minute',
          'social_digest_email_enabled',
          'social_digest_recipients',
          'social_digest_timezone',
          'social_digest_send_day_of_week',
          'social_digest_send_hour',
          'social_digest_send_minute',
          'admin_workspace_modules',
        ]
      : portalAllowedFields;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body && field !== 'admin_workspace_modules' && field !== 'feature_flags') {
        updates[field] = body[field];
      }
    }

    if ('feature_flags' in body) {
      updates.feature_flags = {
        ...existingFeatureFlags,
        ...(body.feature_flags as Record<string, unknown>),
      };
    }

    if ('admin_workspace_modules' in body) {
      const parsed = parseFullAdminWorkspaceModulesForPatch(
        (body as { admin_workspace_modules?: unknown }).admin_workspace_modules,
      );
      if (!parsed) {
        return NextResponse.json(
          { error: 'admin_workspace_modules must include all workspace toggles as booleans' },
          { status: 400 },
        );
      }
      updates.admin_workspace_modules = parsed;
    }

    if ('affiliate_digest_timezone' in updates) {
      const tz = String(updates.affiliate_digest_timezone ?? '').trim();
      if (!isValidIanaTimeZone(tz)) {
        return NextResponse.json(
          { error: 'affiliate_digest_timezone must be a valid IANA time zone' },
          { status: 400 },
        );
      }
      updates.affiliate_digest_timezone = tz;
    }
    if ('affiliate_digest_send_day_of_week' in updates) {
      const d = Number(updates.affiliate_digest_send_day_of_week);
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        return NextResponse.json(
          { error: 'affiliate_digest_send_day_of_week must be an integer 0–6 (Sunday–Saturday)' },
          { status: 400 },
        );
      }
      updates.affiliate_digest_send_day_of_week = d;
    }
    if ('affiliate_digest_send_hour' in updates) {
      const h = Number(updates.affiliate_digest_send_hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        return NextResponse.json(
          { error: 'affiliate_digest_send_hour must be an integer 0–23' },
          { status: 400 },
        );
      }
      updates.affiliate_digest_send_hour = h;
    }
    if ('affiliate_digest_send_minute' in updates) {
      const m = Number(updates.affiliate_digest_send_minute);
      if (!Number.isInteger(m) || m < 0 || m > 59) {
        return NextResponse.json(
          { error: 'affiliate_digest_send_minute must be an integer 0–59' },
          { status: 400 },
        );
      }
      updates.affiliate_digest_send_minute = m;
    }

    // NAT-43 — same schedule validation rules for the branded social digest
    if ('social_digest_timezone' in updates) {
      const tz = String(updates.social_digest_timezone ?? '').trim();
      if (!isValidIanaTimeZone(tz)) {
        return NextResponse.json(
          { error: 'social_digest_timezone must be a valid IANA time zone' },
          { status: 400 },
        );
      }
      updates.social_digest_timezone = tz;
    }
    if ('social_digest_send_day_of_week' in updates) {
      const d = Number(updates.social_digest_send_day_of_week);
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        return NextResponse.json(
          { error: 'social_digest_send_day_of_week must be an integer 0–6 (Sunday–Saturday)' },
          { status: 400 },
        );
      }
      updates.social_digest_send_day_of_week = d;
    }
    if ('social_digest_send_hour' in updates) {
      const h = Number(updates.social_digest_send_hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        return NextResponse.json(
          { error: 'social_digest_send_hour must be an integer 0–23' },
          { status: 400 },
        );
      }
      updates.social_digest_send_hour = h;
    }
    if ('social_digest_send_minute' in updates) {
      const m = Number(updates.social_digest_send_minute);
      if (!Number.isInteger(m) || m < 0 || m > 59) {
        return NextResponse.json(
          { error: 'social_digest_send_minute must be an integer 0–59' },
          { status: 400 },
        );
      }
      updates.social_digest_send_minute = m;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: client, error: updateError } = await adminClient
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating client:', updateError);
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
    }

    // Sync client profile to Obsidian vault (non-blocking)
    if (client) {
      syncClientProfileToVault(client).catch(() => {});
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error('PATCH /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]
 *
 * Permanently delete a client and related rows (moodboards, todos, tasks, searches, ideas,
 * strategies, invites, shoot events when present, then client).
 * Also removes the client folder from the Obsidian vault (non-blocking).
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get the client name before deleting (needed for vault cleanup)
    const { data: client } = await adminClient
      .from('clients')
      .select('name')
      .eq('id', id)
      .single();

    // Delete related records first, then the client. Tables with NO ACTION / missing
    // cascade on client_id (todos, tasks, moodboard_boards) are covered here and by
    // migration 056_client_delete_cascade_fks.sql. knowledge_nodes (Brand DNA / KG sync)
    // is deleted here and via migration 057 ON DELETE CASCADE. shoot_events has no
    // migration in-repo but exists in production and can block deletes without an explicit delete.
    const relatedDeletes = await Promise.all([
      adminClient.from('knowledge_nodes').delete().eq('client_id', id),
      adminClient.from('moodboard_boards').delete().eq('client_id', id),
      adminClient.from('todos').delete().eq('client_id', id),
      adminClient.from('tasks').delete().eq('client_id', id),
      adminClient.from('topic_searches').delete().eq('client_id', id),
      adminClient.from('idea_submissions').delete().eq('client_id', id),
      adminClient.from('client_strategies').delete().eq('client_id', id),
      adminClient.from('invite_tokens').delete().eq('client_id', id),
      adminClient.from('shoot_events').delete().eq('client_id', id),
    ]);

    const firstRelatedError = relatedDeletes.find((r) => r.error)?.error;
    if (firstRelatedError) {
      console.error('Error deleting client-related rows:', firstRelatedError);
      return NextResponse.json(
        {
          error: 'Failed to delete client',
          details: firstRelatedError.message,
        },
        { status: 500 },
      );
    }

    const { error: deleteError } = await adminClient
      .from('clients')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting client:', deleteError);
      return NextResponse.json(
        {
          error: 'Failed to delete client',
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    // Audit log: client deletion
    logActivity(user.id, 'client_deleted', 'client', id, {
      client_name: client?.name ?? 'unknown',
    }).catch(() => {});

    // Remove client folder from Obsidian vault (non-blocking)
    if (client?.name) {
      removeClientFromVault(client.name).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
