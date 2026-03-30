import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';

const parseTaskSchema = z.object({
  text: z.string().min(1, 'Text is required'),
});

/**
 * POST /api/tasks/parse
 *
 * Parse a natural language task description using Claude AI and return structured task fields.
 * Resolves relative dates ("tomorrow", "next Monday"), fuzzy-matches client names and assignee
 * names against the database, and infers priority and task type from context.
 *
 * @auth Required (admin)
 * @body text - Natural language task description (required)
 * @returns {{ title: string, due_date: string | null, client_id: string | null, client_name: string | null, assignee_id: string | null, assignee_name: string | null, priority: string | null, task_type: string | null }}
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
    const parsed = parseTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { text } = parsed.data;
    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are a task parser. Extract structured data from natural language task descriptions. Today's date is ${today}.

Return ONLY valid JSON with these fields:
- title: the task description (cleaned up, without date/assignee/priority words)
- due_date: ISO date string (YYYY-MM-DD) or null. Resolve "today", "tomorrow", "next Monday", "Friday", "end of week", etc.
- client_name: brand/client name if mentioned, or null
- assignee_name: person name if mentioned, or null
- priority: "low", "medium", "high", "urgent", or null (infer from words like "urgent", "ASAP", "whenever", "low priority")
- task_type: "content", "shoot", "edit", "paid_media", "strategy", "other", or null (infer from context)`;

    const aiResponse = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      maxTokens: 200,
      feature: 'task_parse',
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    let aiParsed: {
      title: string;
      due_date: string | null;
      client_name: string | null;
      assignee_name: string | null;
      priority: 'low' | 'medium' | 'high' | 'urgent' | null;
      task_type: 'content' | 'shoot' | 'edit' | 'paid_media' | 'strategy' | 'other' | null;
    };

    try {
      const cleaned = aiResponse.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiParsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI response:', aiResponse.text);
      return NextResponse.json({ error: 'Failed to parse task text' }, { status: 500 });
    }

    // Fuzzy-match client_name against clients table
    let client_id: string | null = null;
    let client_name: string | null = aiParsed.client_name ?? null;

    if (client_name) {
      const { data: clients } = await adminClient
        .from('clients')
        .select('id, name')
        .ilike('name', `%${client_name}%`)
        .limit(1);

      if (clients && clients.length > 0) {
        client_id = clients[0].id;
        client_name = clients[0].name;
      }
    }

    // Fuzzy-match assignee_name against team_members table
    let assignee_id: string | null = null;
    let assignee_name: string | null = aiParsed.assignee_name ?? null;

    if (assignee_name) {
      const { data: members } = await adminClient
        .from('team_members')
        .select('id, full_name')
        .ilike('full_name', `%${assignee_name}%`)
        .limit(1);

      if (members && members.length > 0) {
        assignee_id = members[0].id;
        assignee_name = members[0].full_name;
      }
    }

    return NextResponse.json({
      title: aiParsed.title ?? '',
      due_date: aiParsed.due_date ?? null,
      client_id,
      client_name,
      assignee_id,
      assignee_name,
      priority: aiParsed.priority ?? null,
      task_type: aiParsed.task_type ?? null,
    });
  } catch (error) {
    console.error('POST /api/tasks/parse error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
