import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessClient } from '@/lib/api/client-access';

const rejectSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  hook: z.string().optional(),
  content_pillar: z.string().optional(),
  generation_context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/ideas/reject
 *
 * Record a rejected AI-generated idea for a client. Saves the idea to the rejected_ideas
 * table so it can be used to improve future generation quality and avoid re-surfacing ideas.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID the idea was generated for (required)
 * @body title - Idea title (required)
 * @body description - Optional idea description
 * @body hook - Optional hook text
 * @body content_pillar - Optional content pillar label
 * @body generation_context - Optional metadata about the generation run (key-value pairs)
 * @returns {{ success: true }}
 */
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

  // Org-scope check
  const access = await assertUserCanAccessClient(admin, user.id, parsed.data.client_id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

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
