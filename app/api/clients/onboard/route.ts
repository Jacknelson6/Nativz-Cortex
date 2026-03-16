import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientProfileToVault } from '@/lib/vault/sync';
import { createMondayItem } from '@/lib/monday/client';
import { logActivity } from '@/lib/activity';
import { createLateProfile } from '@/lib/posting/late';
import { crawlClientWebsite } from '@/lib/knowledge/scraper';
import { generateBrandProfile } from '@/lib/knowledge/brand-profile';

const onboardSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  website_url: z.string().url('A valid URL is required'),
  industry: z.string().min(1, 'Industry is required'),
  target_audience: z.string().optional().default(''),
  brand_voice: z.string().optional().default(''),
  topic_keywords: z.array(z.string()).optional().default([]),
  logo_url: z.string().nullable().optional().default(null),
  poc_name: z.string().optional().default(''),
  poc_email: z.string().optional().default(''),
  services: z.array(z.string()).optional().default([]),
  agency: z.string().optional().default(''),
});

/**
 * POST /api/clients/onboard
 *
 * Full client onboarding flow that provisions across four systems in parallel:
 * 1. Cortex DB — creates organization + client records
 * 2. Obsidian Vault — syncs client profile markdown
 * 3. Monday.com — creates board item with service/agency/POC columns
 * 4. Late — creates social media scheduling profile (if SMM service included)
 * Auto-generates a URL-safe slug from the client name (with collision handling).
 * Returns the outcome for each system independently; only the Cortex DB failure is fatal.
 *
 * @auth Required (admin)
 * @body name - Client display name (required)
 * @body website_url - Client website URL (required)
 * @body industry - Industry category (required)
 * @body target_audience - Target audience description
 * @body brand_voice - Brand voice description
 * @body topic_keywords - Array of content topic keywords
 * @body logo_url - Logo image URL (nullable)
 * @body poc_name - Point of contact name
 * @body poc_email - Point of contact email
 * @body services - Array of service strings (e.g. ['SMM', 'Paid Media', 'Editing', 'Affiliates'])
 * @body agency - Agency name override
 * @returns {{ cortex: SystemResult, vault: SystemResult, monday: SystemResult, late: SystemResult }}
 */
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;
    let slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check for slug collision and append suffix if needed
    const { data: existing } = await adminClient
      .from('clients')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Provision across all four systems in parallel
    const [cortexResult, vaultResult, mondayResult, lateResult] = await Promise.allSettled([
      // 1. Create in Cortex DB
      (async () => {
        // Create organization first
        const { data: org, error: orgError } = await adminClient
          .from('organizations')
          .insert({
            name: data.name,
            slug,
            type: 'client',
          })
          .select('id')
          .single();

        if (orgError) throw new Error(`Organization: ${orgError.message}`);

        // Create client linked to org
        const { data: client, error: clientError } = await adminClient
          .from('clients')
          .insert({
            name: data.name,
            slug,
            organization_id: org.id,
            industry: data.industry,
            website_url: data.website_url,
            target_audience: data.target_audience || null,
            brand_voice: data.brand_voice || null,
            topic_keywords: data.topic_keywords,
            logo_url: data.logo_url,
            services: data.services,
            is_active: true,
          })
          .select('id')
          .single();

        if (clientError) throw new Error(`Client: ${clientError.message}`);
        return { clientId: client.id, organizationId: org.id };
      })(),

      // 2. Sync to Vault
      (async () => {
        await syncClientProfileToVault({
          name: data.name,
          industry: data.industry,
          website_url: data.website_url,
          target_audience: data.target_audience,
          brand_voice: data.brand_voice,
          topic_keywords: data.topic_keywords,
          logo_url: data.logo_url,
          poc_name: data.poc_name,
          poc_email: data.poc_email,
          services: data.services,
          agency: data.agency,
        });
        return { synced: true };
      })(),

      // 3. Create in Monday.com with column values
      (async () => {
        // Build Monday.com column values for services, agency, POC
        const columnValues: Record<string, unknown> = {};

        // Service columns (status columns: "Yes" to enable)
        if (data.services.includes('SMM')) columnValues.color_mktsd6y7 = { label: 'Yes' };
        if (data.services.includes('Paid Media')) columnValues.color_mkwz9cwd = { label: 'Yes' };
        if (data.services.includes('Affiliates')) columnValues.color_mktsmz4y = { label: 'Yes' };
        if (data.services.includes('Editing')) columnValues.color_mkwqhwx = { label: 'Yes' };

        // Agency column (status column)
        if (data.agency) columnValues.color_mkrw743r = { label: data.agency };

        // POC column (long text: "Name <email>")
        if (data.poc_name || data.poc_email) {
          const pocText = data.poc_email
            ? `${data.poc_name} <${data.poc_email}>`
            : data.poc_name;
          columnValues.long_text_mkxm4whr = { text: pocText };
        }

        const result = await createMondayItem(
          data.name,
          Object.keys(columnValues).length > 0 ? columnValues : undefined,
        );
        return result ? { mondayId: result.id } : { mondayId: null };
      })(),

      // 4. Create Late profile (for social media scheduling)
      (async () => {
        if (!data.services.includes('SMM')) return { lateProfileId: null };
        const profileId = await createLateProfile(data.name);
        return { lateProfileId: profileId };
      })(),
    ]);

    // Build response
    const response = {
      cortex: cortexResult.status === 'fulfilled'
        ? { success: true, clientId: cortexResult.value.clientId, organizationId: cortexResult.value.organizationId }
        : { success: false, error: (cortexResult.reason as Error).message },
      vault: vaultResult.status === 'fulfilled'
        ? { success: true }
        : { success: false, error: (vaultResult.reason as Error).message },
      monday: mondayResult.status === 'fulfilled'
        ? { success: true, mondayId: (mondayResult.value as { mondayId: string | null }).mondayId }
        : { success: false, error: (mondayResult.reason as Error).message },
      late: lateResult.status === 'fulfilled'
        ? { success: true, lateProfileId: (lateResult.value as { lateProfileId: string | null }).lateProfileId }
        : { success: false, error: (lateResult.reason as Error).message },
    };

    // If the core DB creation failed, that's a hard error
    if (!response.cortex.success) {
      return NextResponse.json(
        { error: 'Failed to create client in database', details: response },
        { status: 500 },
      );
    }

    // Link Late profile to client (non-blocking)
    if (response.late.success && response.late.lateProfileId && 'clientId' in response.cortex) {
      Promise.resolve(
        adminClient
          .from('clients')
          .update({ late_profile_id: response.late.lateProfileId })
          .eq('id', response.cortex.clientId as string)
      ).catch(() => {});
    }

    // Log activity (non-blocking)
    if (response.cortex.success && 'clientId' in response.cortex) {
      const clientId = response.cortex.clientId as string;

      logActivity(user.id, 'client_created', 'client', clientId, {
        client_name: data.name,
      }).catch(() => {});

      // 5. Build knowledge graph from website (non-blocking background job)
      // Scrapes website → creates knowledge entries → generates brand profile → embeds for semantic search
      if (data.website_url) {
        (async () => {
          try {
            await crawlClientWebsite({
              clientId,
              startUrl: data.website_url,
              maxPages: 30,
              maxDepth: 2,
              createdBy: user.id,
            });
            await generateBrandProfile(clientId, user.id);
          } catch (err) {
            console.error('Knowledge graph build failed (non-blocking):', err);
          }
        })();
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('POST /api/clients/onboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
