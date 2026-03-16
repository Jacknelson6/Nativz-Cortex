import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCommand } from '@/lib/nerd/slash-commands';

const schema = z.object({
  command: z.string().min(1),
  args: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const cmd = getCommand(parsed.data.command);
    if (!cmd) {
      return NextResponse.json({ error: `Unknown command: /${parsed.data.command}` }, { status: 404 });
    }

    if (cmd.type !== 'direct' || !cmd.handler) {
      return NextResponse.json({ error: 'This command must be run through the AI' }, { status: 400 });
    }

    const result = await cmd.handler(parsed.data.args ?? '', user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/nerd/command error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
