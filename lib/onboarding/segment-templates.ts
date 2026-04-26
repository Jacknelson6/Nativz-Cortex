import type { SupabaseClient } from '@supabase/supabase-js';
import type { SegmentKind } from '@/lib/onboarding/flows';

type AdminClient = SupabaseClient;

/**
 * Default content for each service segment kind. The flow builder uses
 * this to scaffold a tracker (onboarding_trackers row + phases +
 * checklist groups + items) the first time an admin adds a segment.
 *
 * Tasks live under named groups; each task has an owner ('agency' or
 * 'client') and rolls up to the segment's progress percent.
 *
 * Phase 5 only ships the SOCIAL template. paid_media + web exist in the
 * SEGMENT_PALETTE as 'coming soon' but their templates are empty stubs
 * here — adding either segment will create an empty tracker the admin
 * can fill in by hand.
 */

type GroupSpec = {
  name: string;
  items: Array<{
    task: string;
    description?: string;
    owner: 'agency' | 'client';
  }>;
};

type PhaseSpec = {
  name: string;
  description?: string;
  what_we_need?: string;
  status?: 'not_started' | 'in_progress' | 'done';
};

type SegmentTemplate = {
  service: string; // matches onboarding_trackers.service column
  title: string;
  phases: PhaseSpec[];
  groups: GroupSpec[];
};

// Help footer used inside descriptions where it makes sense.
const HELP = 'Stuck? Email Jack@nativz.io (or Jack@andersoncollaborative.com if Anderson) and we will jump on a call.';

const SOCIAL_TEMPLATE: SegmentTemplate = {
  service: 'social',
  title: 'Social setup',
  phases: [
    {
      name: 'Account access',
      description: 'Connect each social account so we can post + pull analytics.',
      what_we_need: 'Be logged into the correct social account in your browser, then click Connect on each platform card.',
      status: 'in_progress',
    },
    {
      name: 'Brand assets',
      description: 'Logos, fonts, and brand-safe palette for templated content.',
      what_we_need: 'Upload below or paste a Drive/Dropbox link.',
    },
    {
      name: 'Raw footage',
      description: 'B-roll, photo libraries, behind-the-scenes — anything we can edit and re-cut.',
      what_we_need: 'A shared Drive/Dropbox folder is easiest; uploads work too.',
    },
    {
      name: 'Kickoff',
      description: 'Call to lock direction, content pillars, and the first two-week sprint.',
    },
  ],
  groups: [
    {
      name: 'Connect social accounts',
      items: [
        { task: 'Connect TikTok (@brand)', description: 'Open the TikTok card on the public page and finish the Zernio OAuth flow. You must be logged into the correct TikTok account in your browser first.', owner: 'client' },
        { task: 'Connect Instagram (@brand)', description: 'Same drill — make sure you are logged into the right Instagram account before clicking Connect. Connect the Facebook page too if your IG is linked through one.', owner: 'client' },
        { task: 'Connect Facebook page', description: 'Connecting your Facebook page also covers Meta Business and IG cross-posting in one go.', owner: 'client' },
        { task: 'Connect YouTube (@brand)', description: 'Granting YouTube access lets us schedule Shorts and pull retention analytics.', owner: 'client' },
        { task: 'Verify all platforms green-checked in Cortex', description: 'After the client connects each account, the agency confirms the integration shows healthy in /admin/clients/[slug]/integrations.', owner: 'agency' },
      ],
    },
    {
      name: 'Brand assets',
      items: [
        { task: 'Logo files (SVG + PNG)', description: 'Upload logo files or paste a Drive/Dropbox link.', owner: 'client' },
        { task: 'Brand colors + fonts', description: 'Hex values for primary/secondary palette and font names. A one-page brand guide PDF is perfect.', owner: 'client' },
        { task: 'Tagline + voice notes', description: 'Anything you have that captures how the brand "talks" — taglines, do/don\'t lists, sample copy.', owner: 'client' },
      ],
    },
    {
      name: 'Raw footage + photo library',
      items: [
        { task: 'Drive/Dropbox link to raw video footage', description: 'B-roll, product shots, customer videos, behind-the-scenes — anything we can edit. Paste a shared link or upload directly.', owner: 'client' },
        { task: 'Existing photo library', description: 'Lifestyle photos, product photography, founder/team headshots.', owner: 'client' },
        { task: 'Past content that performed well', description: 'Links to your top-performing posts so we can pattern-match what your audience already responds to.', owner: 'client' },
      ],
    },
    {
      name: 'Strategy + kickoff',
      items: [
        { task: 'Schedule kickoff call', description: 'We confirm direction, content pillars, and the first two-week sprint.', owner: 'agency' },
        { task: 'Send Cortex portal invite', description: 'Generate an invite token from /admin/clients/[slug] → Portal users → Invite. The client gets a magic link to join the dashboard so they can review topic research, watch retros, and approve content. Mark this complete once the link has been sent.', owner: 'agency' },
        { task: 'Confirm content pillars', description: 'After kickoff: 3–5 content pillars approved by the brand.', owner: 'agency' },
        { task: 'First-batch shoot list approved', description: HELP, owner: 'agency' },
      ],
    },
  ],
};

const TEMPLATES: Partial<Record<SegmentKind, SegmentTemplate>> = {
  social: SOCIAL_TEMPLATE,
};

const DEFAULT_TEMPLATE_BY_KIND: Record<SegmentKind, SegmentTemplate> = {
  agreement_payment: {
    service: 'agreement_payment',
    title: 'Agreement & Payment',
    phases: [],
    groups: [],
  },
  social: SOCIAL_TEMPLATE,
  paid_media: {
    service: 'paid_media',
    title: 'Paid Media setup',
    phases: [],
    groups: [],
  },
  web: {
    service: 'web',
    title: 'Web setup',
    phases: [],
    groups: [],
  },
  editing: {
    service: 'editing',
    title: 'Editing kickoff',
    phases: [],
    groups: [],
  },
};

export function getSegmentTemplate(kind: SegmentKind): SegmentTemplate {
  return TEMPLATES[kind] ?? DEFAULT_TEMPLATE_BY_KIND[kind];
}

export async function scaffoldSegmentTracker(opts: {
  admin: AdminClient;
  clientId: string;
  kind: SegmentKind;
  createdBy: string;
}): Promise<
  | { ok: true; trackerId: string; title: string; itemCount: number }
  | { ok: false; error: string }
> {
  const tpl = getSegmentTemplate(opts.kind);

  // Older 'one tracker per (client, service)' UNIQUE constraint still
  // applies. Re-using a service requires the previous tracker to be
  // archived first — flow.deleteSegment cascades the tracker, so this
  // is rare in practice. If a stale tracker exists we surface it.
  const { data: existing } = await opts.admin
    .from('onboarding_trackers')
    .select('id')
    .eq('client_id', opts.clientId)
    .eq('service', tpl.service)
    .eq('is_template', false)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `A ${tpl.title} tracker already exists for this client (id ${existing.id}). Remove it first.`,
    };
  }

  const { data: tracker, error: tErr } = await opts.admin
    .from('onboarding_trackers')
    .insert({
      client_id: opts.clientId,
      service: tpl.service,
      title: tpl.title,
      status: 'active',
      is_template: false,
      created_by: opts.createdBy,
    })
    .select('id')
    .single();
  if (tErr || !tracker) {
    return { ok: false, error: tErr?.message ?? 'tracker insert failed' };
  }

  // Phases (timeline). All inserted in one go.
  if (tpl.phases.length > 0) {
    await opts.admin.from('onboarding_phases').insert(
      tpl.phases.map((p, i) => ({
        tracker_id: tracker.id,
        name: p.name,
        description: p.description ?? null,
        what_we_need: p.what_we_need ?? null,
        status: p.status ?? 'not_started',
        sort_order: i,
        actions: [],
      })),
    );
  }

  // Groups + items.
  let itemCount = 0;
  for (const [gi, g] of tpl.groups.entries()) {
    const { data: group, error: gErr } = await opts.admin
      .from('onboarding_checklist_groups')
      .insert({
        tracker_id: tracker.id,
        name: g.name,
        sort_order: gi,
      })
      .select('id')
      .single();
    if (gErr || !group) continue;
    if (g.items.length > 0) {
      await opts.admin.from('onboarding_checklist_items').insert(
        g.items.map((it, i) => ({
          group_id: group.id,
          task: it.task,
          description: it.description ?? null,
          owner: it.owner,
          status: 'pending',
          sort_order: i,
        })),
      );
      itemCount += g.items.length;
    }
  }

  return { ok: true, trackerId: tracker.id, title: tpl.title, itemCount };
}
