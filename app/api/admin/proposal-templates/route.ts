import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';
import { CHAT_DRAFT_SOURCE_REPO } from '@/lib/proposals/draft-render';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { data, error } = await admin
    .from('proposal_templates')
    .select('id, agency, name, description, source_repo, source_folder, public_base_url, tiers_preview, active')
    .eq('active', true)
    // Synth templates from the chat-driven builder share this repo
    // sentinel so they don't appear in the legacy template picker.
    .neq('source_repo', CHAT_DRAFT_SOURCE_REPO)
    .order('agency')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}
