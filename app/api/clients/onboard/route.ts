import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientProfileToVault } from '@/lib/vault/sync';
import { createMondayItem } from '@/lib/monday/client';

const onboardSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  website_url: z.string().url('A valid URL is required'),
  industry: z.string().min(1, 'Industry is required'),
  target_audience: z.string().optional().default(''),
  brand_voice: z.string().optional().default(''),
  topic_keywords: z.array(z.string()).optional().default([]),
  logo_url: z.string().nullable().optional().default(null),
});

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
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Provision across all three systems in parallel
    const [cortexResult, vaultResult, mondayResult] = await Promise.allSettled([
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
        });
        return { synced: true };
      })(),

      // 3. Create in Monday.com
      (async () => {
        const result = await createMondayItem(data.name);
        return result ? { mondayId: result.id } : { mondayId: null };
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
    };

    // If the core DB creation failed, that's a hard error
    if (!response.cortex.success) {
      return NextResponse.json(
        { error: 'Failed to create client in database', details: response },
        { status: 500 },
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('POST /api/clients/onboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
