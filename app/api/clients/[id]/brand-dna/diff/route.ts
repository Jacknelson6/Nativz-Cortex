import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/[id]/brand-dna/diff
 *
 * Compare the two most recent brand guidelines (active vs previous) section by section.
 *
 * @auth Required
 * @returns {{ sections: { heading, active, previous, changed }[] }}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: guidelines } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata, created_at')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .order('created_at', { ascending: false })
    .limit(2);

  if (!guidelines || guidelines.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 versions to diff' }, { status: 400 });
  }

  const [active, previous] = guidelines;
  const activeSections = parseSections(active.content as string);
  const previousSections = parseSections(previous.content as string);

  const allHeadings = new Set([...activeSections.keys(), ...previousSections.keys()]);
  const sections = [...allHeadings].map((heading) => {
    const activeContent = activeSections.get(heading) ?? '';
    const previousContent = previousSections.get(heading) ?? '';
    return {
      heading,
      active: activeContent,
      previous: previousContent,
      changed: activeContent.trim() !== previousContent.trim(),
    };
  });

  return NextResponse.json({ sections });
}

/** Split markdown into sections by ## headings */
function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = content.split(/^## /m);

  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf('\n');
    if (newlineIdx === -1) {
      sections.set(part.trim(), '');
    } else {
      const heading = part.slice(0, newlineIdx).trim();
      const body = part.slice(newlineIdx + 1).trim();
      sections.set(heading, body);
    }
  }

  return sections;
}
