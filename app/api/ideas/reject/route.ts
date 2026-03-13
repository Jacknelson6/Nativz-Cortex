import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const rejectSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  hook: z.string().optional(),
  content_pillar: z.string().optional(),
  generation_context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin.from('rejected_ideas').insert({
    client_id: parsed.data.client_id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    hook: parsed.data.hook ?? null,
    content_pillar: parsed.data.content_pillar ?? null,
    generation_context: parsed.data.generation_context ?? {},
  });

  return NextResponse.json({ success: true });
}
