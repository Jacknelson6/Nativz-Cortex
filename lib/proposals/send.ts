import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { layout, sendOnboardingEmail } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';

type AdminClient = SupabaseClient;

type ProposalRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  signer_name: string | null;
  signer_email: string | null;
  external_url: string | null;
  agency: AgencyBrand | null;
};

/**
 * Send / resend the branded "Review and sign" email for a generated proposal.
 * Prereq: the proposal must already be published (`external_url` populated).
 * The email links straight to the docs host — that page handles sign+PDF+Stripe.
 */
export async function sendProposal(
  proposalId: string,
  opts: { admin?: AdminClient } = {},
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = opts.admin ?? createAdminClient();

  const { data: proposal, error } = await admin
    .from('proposals')
    .select('id, slug, title, status, signer_name, signer_email, external_url, agency')
    .eq('id', proposalId)
    .maybeSingle<ProposalRow>();
  if (error || !proposal) return { ok: false, error: 'Proposal not found' };
  if (!proposal.signer_email) return { ok: false, error: 'Signer email is required' };
  if (!proposal.external_url) {
    return { ok: false, error: 'Proposal has not been published to the docs repo yet.' };
  }
  if (!['draft', 'sent', 'viewed'].includes(proposal.status)) {
    return { ok: false, error: `Cannot send a proposal in status '${proposal.status}'` };
  }

  const agency: AgencyBrand = proposal.agency ?? 'nativz';
  const firstName = (proposal.signer_name ?? '').split(' ')[0] || 'there';
  const brandName = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';

  const cardHtml = `
    <div class="card">
      <h1 class="heading">Your proposal is ready, ${escapeHtml(firstName)}.</h1>
      <p class="subtext">
        <strong>${escapeHtml(proposal.title)}</strong> is ready for your review and signature.
        Pick your tier, fill in a few details, and sign. Payment runs on Stripe at the end.
      </p>
      <div class="button-wrap">
        <a href="${proposal.external_url}" class="button">Review and sign &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        Or open: <a href="${proposal.external_url}" style="color:inherit;text-decoration:underline;">${proposal.external_url}</a>
      </p>
      <p class="small" style="margin-top:16px;">
        Questions? Reply to this email — it comes straight to the ${escapeHtml(brandName)} team.
      </p>
    </div>`;

  const sendResult = await sendOnboardingEmail({
    to: proposal.signer_email,
    subject: `Proposal — ${proposal.title}`,
    html: layout(cardHtml, agency),
    agency,
  });
  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error };
  }

  const now = new Date().toISOString();
  await admin
    .from('proposals')
    .update({ status: 'sent', sent_at: now })
    .eq('id', proposal.id);
  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'sent',
    metadata: { to: proposal.signer_email, resend_id: sendResult.id, url: proposal.external_url },
  });

  return { ok: true, url: proposal.external_url };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
