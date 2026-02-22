import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gatherSerpData } from '@/lib/brave/client';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { buildShootPlanPrompt } from '@/lib/prompts/shoot-plan';
import { getClientMemory, formatClientMemoryBlock } from '@/lib/vault/content-memory';
import { syncShootPlanToVault } from '@/lib/vault/sync';
import type { ShootPlan } from '@/lib/types/strategy';

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: shootId } = await params;

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

    // Fetch shoot event
    const { data: shoot, error: shootError } = await adminClient
      .from('shoot_events')
      .select('*')
      .eq('id', shootId)
      .single();

    if (shootError || !shoot) {
      return NextResponse.json({ error: 'Shoot event not found' }, { status: 404 });
    }

    if (!shoot.client_id) {
      return NextResponse.json(
        { error: 'This shoot is not linked to a client. Assign a client first.' },
        { status: 400 },
      );
    }

    // Fetch client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('*')
      .eq('id', shoot.client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Mark as generating
    await adminClient
      .from('shoot_events')
      .update({ plan_status: 'generating' })
      .eq('id', shootId);

    try {
      // Gather client memory and SERP data in parallel
      const [memory, serpData] = await Promise.all([
        getClientMemory(client.id),
        gatherSerpData(
          `${client.industry} ${(client.topic_keywords ?? []).slice(0, 2).join(' ')} latest trends`,
          { timeRange: 'last_7_days' },
        ),
      ]);

      const clientMemoryBlock = formatClientMemoryBlock(memory);

      // Build and run AI prompt
      const prompt = buildShootPlanPrompt({
        clientName: client.name,
        industry: client.industry,
        targetAudience: client.target_audience ?? 'General',
        brandVoice: client.brand_voice ?? 'Professional',
        topicKeywords: client.topic_keywords ?? [],
        shootDate: shoot.shoot_date,
        shootTitle: shoot.title,
        shootLocation: shoot.location,
        shootNotes: shoot.notes,
        serpData,
        clientMemoryBlock,
        brandPreferences: client.preferences,
      });

      const aiResult = await createCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 12000,
      });

      const plan = parseAIResponseJSON<ShootPlan>(aiResult.text);

      // Save plan to shoot event
      await adminClient
        .from('shoot_events')
        .update({
          plan_status: 'sent',
          plan_data: plan as unknown as Record<string, unknown>,
          plan_generated_at: new Date().toISOString(),
        })
        .eq('id', shootId);

      // Non-blocking vault sync
      syncShootPlanToVault(plan, client.name, shoot.shoot_date, shoot.title).catch(() => {});

      return NextResponse.json({
        shootId,
        status: 'generated',
        plan,
      });
    } catch (processError) {
      // Reset status on failure
      await adminClient
        .from('shoot_events')
        .update({ plan_status: 'pending' })
        .eq('id', shootId);

      console.error('Shoot plan generation failed:', processError);
      return NextResponse.json(
        { error: 'Plan generation failed', details: processError instanceof Error ? processError.message : 'Unknown error' },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('POST /api/shoots/[id]/plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: shootId } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: shoot, error } = await adminClient
      .from('shoot_events')
      .select('*, clients(name, slug)')
      .eq('id', shootId)
      .single();

    if (error || !shoot) {
      return NextResponse.json({ error: 'Shoot event not found' }, { status: 404 });
    }

    return NextResponse.json(shoot);
  } catch (error) {
    console.error('GET /api/shoots/[id]/plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
