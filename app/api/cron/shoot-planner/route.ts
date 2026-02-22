import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gatherSerpData } from '@/lib/brave/client';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { buildShootPlanPrompt } from '@/lib/prompts/shoot-plan';
import { getClientMemory, formatClientMemoryBlock } from '@/lib/vault/content-memory';
import { syncShootPlanToVault } from '@/lib/vault/sync';
import type { ShootPlan } from '@/lib/types/strategy';

export const maxDuration = 300;

/**
 * Vercel cron job — runs daily to auto-generate shoot plans
 * for upcoming shoots (default: 3 days before the shoot date).
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/shoot-planner", "schedule": "0 8 * * *" }] }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sets this header for cron jobs)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const DAYS_BEFORE_SHOOT = parseInt(process.env.SHOOT_PLAN_DAYS_BEFORE ?? '3', 10);

    // Find shoots happening in DAYS_BEFORE_SHOOT days that don't have plans yet
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + DAYS_BEFORE_SHOOT);

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const { data: pendingShoots, error } = await adminClient
      .from('shoot_events')
      .select('*, clients(*)')
      .eq('plan_status', 'pending')
      .not('client_id', 'is', null)
      .gte('shoot_date', dayStart.toISOString())
      .lte('shoot_date', dayEnd.toISOString());

    if (error) {
      console.error('Cron: failed to fetch pending shoots:', error);
      return NextResponse.json({ error: 'Failed to fetch shoots' }, { status: 500 });
    }

    if (!pendingShoots || pendingShoots.length === 0) {
      return NextResponse.json({ message: 'No shoots to plan', processed: 0 });
    }

    let processed = 0;
    let failed = 0;

    for (const shoot of pendingShoots) {
      const client = shoot.clients as {
        id: string;
        name: string;
        industry: string;
        target_audience: string | null;
        brand_voice: string | null;
        topic_keywords: string[];
        preferences: Record<string, unknown> | null;
      };

      if (!client) {
        failed++;
        continue;
      }

      try {
        // Mark as generating
        await adminClient
          .from('shoot_events')
          .update({ plan_status: 'generating' })
          .eq('id', shoot.id);

        // Gather context
        const [memory, serpData] = await Promise.all([
          getClientMemory(client.id),
          gatherSerpData(
            `${client.industry} ${(client.topic_keywords ?? []).slice(0, 2).join(' ')} latest trends`,
            { timeRange: 'last_7_days' },
          ),
        ]);

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
          clientMemoryBlock: formatClientMemoryBlock(memory),
          brandPreferences: client.preferences as import('@/lib/types/database').ClientPreferences | null,
        });

        const aiResult = await createCompletion({
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 12000,
        });

        const plan = parseAIResponseJSON<ShootPlan>(aiResult.text);

        // Save plan
        await adminClient
          .from('shoot_events')
          .update({
            plan_status: 'sent',
            plan_data: plan as unknown as Record<string, unknown>,
            plan_generated_at: new Date().toISOString(),
          })
          .eq('id', shoot.id);

        // Vault sync (non-blocking)
        syncShootPlanToVault(plan, client.name, shoot.shoot_date, shoot.title).catch(() => {});

        processed++;
      } catch (planError) {
        console.error(`Cron: failed to generate plan for shoot ${shoot.id}:`, planError);
        await adminClient
          .from('shoot_events')
          .update({ plan_status: 'pending' })
          .eq('id', shoot.id);
        failed++;
      }
    }

    return NextResponse.json({
      message: `Processed ${processed} shoot plans`,
      processed,
      failed,
      total: pendingShoots.length,
    });
  } catch (error) {
    console.error('Cron shoot-planner error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
