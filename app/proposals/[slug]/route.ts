import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderProposalLandingHtml, type TemplateFolder } from '@/lib/proposals/render-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLDER_TO_TEMPLATE: Record<string, TemplateFolder> = {
  'content-editing-packages': 'anderson-content-editing',
};

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const admin = createAdminClient();

  // Look up the proposal + its template. Slug must exist; status must be
  // anything but 'draft' (drafts shouldn't be reachable until generated).
  const { data: proposal } = await admin
    .from('proposals')
    .select(
      'id, slug, status, agency, template_id, expires_at',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) return new NextResponse('Not found', { status: 404 });
  if (proposal.status === 'draft' || proposal.status === 'canceled') {
    return new NextResponse('Not found', { status: 404 });
  }
  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    return new NextResponse('This proposal has expired.', { status: 410 });
  }

  const { data: template } = await admin
    .from('proposal_templates')
    .select('agency, source_folder')
    .eq('id', proposal.template_id)
    .maybeSingle();
  if (!template) return new NextResponse('Template not found', { status: 500 });

  const templateFolder = FOLDER_TO_TEMPLATE[template.source_folder];
  if (!templateFolder) {
    return new NextResponse(`No renderer for template ${template.source_folder}`, { status: 500 });
  }

  const html = await renderProposalLandingHtml({
    templateFolder,
    agency: template.agency as 'anderson' | 'nativz',
    sourceFolder: template.source_folder,
    slug: proposal.slug,
  });

  // Fire a "viewed" event server-side. First view also bumps proposal.viewed_at.
  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'viewed',
    metadata: {},
  });
  if (proposal.status === 'sent') {
    await admin
      .from('proposals')
      .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('id', proposal.id);
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
}
