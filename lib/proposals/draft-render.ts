import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceLine } from '@/lib/proposals/draft-engine';

/**
 * Bridge between the chat-driven draft schema and the canonical proposal
 * pipeline. createProposalDraft() (lib/proposals/create.ts) requires a
 * template_id + tier; the chat draft has neither. This helper inserts a
 * transient `proposal_templates` row marked with the sentinel
 * source_repo='chat-draft' (so the template picker skips it) and a single
 * tier matching the draft totals + scope.
 *
 * Subsequent renders (sign page, PDF, post-paid counter-sign) read from
 * the synth template like any other, so the rest of the pipeline doesn't
 * need to know whether a proposal came from chat or from a stock template.
 */

type AdminClient = SupabaseClient;

const CHAT_DRAFT_SENTINEL = 'chat-draft';

export type DraftSnapshot = {
  id: string;
  agency: 'anderson' | 'nativz';
  title: string | null;
  service_lines: ServiceLine[];
  custom_blocks: Array<{ id: string; kind: 'markdown' | 'image'; content: string; caption?: string; position: number }>;
  total_cents: number | null;
  deposit_cents: number | null;
  payment_model: 'one_off' | 'subscription';
  cadence: 'week' | 'month' | 'quarter' | 'year' | null;
  signer_legal_entity: string | null;
  client_id: string | null;
  clients?: { name: string | null } | { name: string | null }[] | null;
};

export async function renderDraftAsTemplateTier(
  draft: DraftSnapshot,
  admin: AdminClient,
): Promise<
  | { ok: true; templateId: string; tierId: string }
  | { ok: false; error: string }
> {
  if (draft.total_cents == null || draft.deposit_cents == null) {
    return { ok: false, error: 'draft totals not computed' };
  }

  const isSubscription = draft.payment_model === 'subscription';
  const cadence = draft.cadence ?? (isSubscription ? 'month' : 'month');

  const tierId = 'standard';
  const tierLabel = draft.title?.trim() || 'Custom proposal';
  const tier = {
    id: tierId,
    name: tierLabel,
    subscription: isSubscription,
    cadence,
    total_cents: draft.total_cents,
    deposit_cents: draft.deposit_cents,
    ...(isSubscription ? { monthly_cents: draft.total_cents } : {}),
  };

  // Description rendered on the public sign page above the tier card.
  // We pull from the draft service lines to keep the chat→signer text
  // contract self-explanatory.
  const description = renderDescriptionFromLines(draft.service_lines, isSubscription, cadence);

  // Public base URL: the host the sign page lives on for this agency.
  const publicBaseUrl =
    draft.agency === 'anderson'
      ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ?? 'https://cortex.andersoncollaborative.com'
      : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ?? 'https://cortex.nativz.io';

  // source_folder is part of (agency, source_folder) UNIQUE — uniqueness
  // per draft is enforced by the draft id slice.
  const sourceFolder = `${CHAT_DRAFT_SENTINEL}-${draft.id.slice(0, 12)}`;

  const { data, error } = await admin
    .from('proposal_templates')
    .insert({
      agency: draft.agency,
      name: tierLabel,
      description,
      source_repo: CHAT_DRAFT_SENTINEL,
      source_folder: sourceFolder,
      public_base_url: publicBaseUrl,
      tiers_preview: [tier],
      active: true,
    })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'template insert failed' };
  }
  return { ok: true, templateId: data.id as string, tierId };
}

function renderDescriptionFromLines(
  lines: ServiceLine[],
  isSubscription: boolean,
  cadence: string,
): string {
  if (lines.length === 0) return 'Custom proposal.';
  const summary = lines
    .map((l) => `${l.quantity} × ${l.name_snapshot}`)
    .join(', ');
  const cadenceWord = cadence === 'year' ? 'yr' : cadence === 'week' ? 'wk' : 'mo';
  return isSubscription
    ? `Custom retainer covering ${summary}. Billed ${cadenceWord}.`
    : `Custom project covering ${summary}.`;
}

export const CHAT_DRAFT_SOURCE_REPO = CHAT_DRAFT_SENTINEL;
