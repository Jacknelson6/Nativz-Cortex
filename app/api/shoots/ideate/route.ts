/**
 * POST /api/shoots/ideate
 *
 * AI-powered shoot ideation: takes shoot context (client, date, notes,
 * videographer details) and generates a full content plan with video ideas,
 * talking points, and shot list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';

export const maxDuration = 60;

const ideateSchema = z.object({
  clientName: z.string().min(1),
  clientId: z.string().uuid().nullable().optional(),
  shootDate: z.string().optional(),
  industry: z.string().optional(),
  context: z.string().min(1, 'Provide some details about the shoot'),
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
    const parsed = ideateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { clientName, clientId, shootDate, industry, context } = parsed.data;

    // Optionally fetch client brand context from DB
    let brandContext = '';
    if (clientId) {
      const { data: client } = await adminClient
        .from('clients')
        .select('industry, target_audience, brand_voice, topic_keywords, website_url')
        .eq('id', clientId)
        .single();
      if (client) {
        const parts = [];
        if (client.industry) parts.push(`Industry: ${client.industry}`);
        if (client.target_audience) parts.push(`Target audience: ${client.target_audience}`);
        if (client.brand_voice) parts.push(`Brand voice: ${client.brand_voice}`);
        if (client.topic_keywords?.length) parts.push(`Key topics: ${client.topic_keywords.join(', ')}`);
        if (client.website_url) parts.push(`Website: ${client.website_url}`);
        brandContext = parts.join('\n');
      }
    }

    const dateLabel = shootDate
      ? new Date(shootDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
      : 'Upcoming';

    const systemPrompt = `You are a creative director at a video content agency. You help plan content shoots by turning brief details into actionable shoot plans.

Your output must be a JSON object with this exact structure:
{
  "title": "Short title for this shoot plan (5-8 words)",
  "summary": "2-3 sentence overview of the shoot plan",
  "videoIdeas": [
    {
      "title": "Video title / concept name",
      "hook": "Opening hook (first 3 seconds) to grab attention",
      "format": "Short-form / Long-form / Reel / Story / etc.",
      "talkingPoints": ["Point 1", "Point 2", "Point 3"],
      "shotList": ["Shot description 1", "Shot description 2"],
      "whyItWorks": "1 sentence on why this will resonate with the audience"
    }
  ],
  "generalTips": ["Tip 1 for the videographer", "Tip 2"],
  "equipmentSuggestions": ["Equipment or setup suggestion 1", "Suggestion 2"]
}

Generate 3-5 video ideas. Be specific, creative, and actionable. Each idea should be something a videographer can film on the shoot day. Think trending formats, relatable hooks, and scroll-stopping content.`;

    const userPrompt = `Plan a content shoot for **${clientName}**.
${industry ? `Industry: ${industry}` : ''}
Shoot date: ${dateLabel}

**Videographer/team notes:**
${context}

${brandContext ? `**Brand context:**\n${brandContext}` : ''}

Generate a detailed shoot plan with specific video ideas, hooks, talking points, and shot lists. Make it practical and ready to execute on shoot day.`;

    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 3000,
    });

    // Parse JSON from AI response
    let plan;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      plan = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({
        plan: {
          title: `${clientName} Shoot Plan`,
          summary: result.text.slice(0, 300),
          videoIdeas: [],
          generalTips: [],
          equipmentSuggestions: [],
          raw: result.text,
        },
        usage: result.usage,
        estimatedCost: result.estimatedCost,
      });
    }

    return NextResponse.json({
      plan,
      usage: result.usage,
      estimatedCost: result.estimatedCost,
    });
  } catch (error) {
    console.error('POST /api/shoots/ideate error:', error);
    return NextResponse.json({ error: 'Failed to generate shoot plan' }, { status: 500 });
  }
}
