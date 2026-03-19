import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateBrandContext } from '@/lib/knowledge/brand-context';

const bodySchema = z.object({
  sections: z.array(z.string()).min(1),
});

/**
 * POST /api/clients/[id]/brand-dna/apply-draft
 *
 * Apply selected sections from the latest draft to the active guideline.
 * Merges chosen sections from the newest version into the previous active version.
 *
 * @auth Required (admin)
 * @body sections - Array of section headings to accept from the draft
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: guidelines } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .order('created_at', { ascending: false })
    .limit(2);

  if (!guidelines || guidelines.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 versions to apply draft' }, { status: 400 });
  }

  const [draft, active] = guidelines;
  const draftSections = parseSections(draft.content as string);
  const activeSections = parseSections(active.content as string);

  // Merge: use draft sections for selected headings, keep active for the rest
  const acceptedSet = new Set(parsed.data.sections);
  const merged = new Map<string, string>();

  // Start with all active sections
  for (const [heading, body] of activeSections) {
    merged.set(heading, body);
  }
  // Override with draft sections that were accepted
  for (const [heading, body] of draftSections) {
    if (acceptedSet.has(heading)) {
      merged.set(heading, body);
    }
  }

  const mergedContent = [...merged.entries()]
    .map(([heading, body]) => `## ${heading}\n${body}`)
    .join('\n\n');

  // Update the draft entry with merged content (it becomes the new active)
  await admin
    .from('client_knowledge_entries')
    .update({ content: mergedContent, updated_at: new Date().toISOString() })
    .eq('id', draft.id);

  // The active entry is already superseded by the draft (done during generateBrandDNA)
  // Update client status
  await admin
    .from('clients')
    .update({ brand_dna_status: 'active' })
    .eq('id', clientId);

  invalidateBrandContext(clientId);
  return NextResponse.json({ success: true });
}

function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = content.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    if (nl === -1) sections.set(part.trim(), '');
    else sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  return sections;
}
