/**
 * Video content & video creative SOP — presenter deck (Nativz).
 * Grounded in:
 * - `ac-knowledge-graph/vault/sops/creative-production-sop.md` (brief → published)
 * - `ac-knowledge-graph/vault/workflows/creative-production-workflow.md`
 * - `ac-knowledge-graph/vault/service-playbooks/video-production-service-playbook.md`
 * - Nativz pipeline model (`app/api/pipeline/summary/route.ts` — video editing SOP)
 */
export interface ContentProductionSopSlide {
  title: string;
  body: string;
  notes?: string | null;
}

/** Bump when default seeded deck content changes (ensure logic migrates old rows). */
export const VIDEO_CONTENT_SOP_SEED_VERSION = 3;

export const CONTENT_PRODUCTION_SOP_SLIDES: ContentProductionSopSlide[] = [
  {
    title: 'Video content production SOP',
    body: `## Nativz · Video content & creative

**Purpose**

One clear path for **video content** and **video creatives** we produce for clients — from brief and shoot through edit, approval, publish, and performance — so teams show up prepared and clients see consistent quality.

**What this covers**

Organic and paid **short-form and campaign video**, edits from client or field footage, and **ad-ready cuts** (Meta, TikTok, YouTube, CTV where applicable). Written long-form SEO content lives in a separate written-content SOP.

**Sources**

Agency creative SOP (**brief → published**), video production playbook, and Nativz **monthly pipeline** (shoot → raws → edit → approval → boost).`,
  },
  {
    title: 'Roles & ownership',
    body: `**Client-facing**
- **Strategist** — client relationship, priorities, assigns videographer + editor in the pipeline
- **Account manager** — approvals, timelines, client comms on creative rounds

**Production**
- **Videographer** — shoot days, capture, **raw upload** (nothing edits until raws land)
- **Lead editor** — owns editing capacity and delegation under them
- **Editors** — cut, revise, package formats
- **Editing manager (EM)** — quality gate before client sees work

**Go-live**
- **SMM** — scheduling, posting, **boosting** where applicable

**Creative direction (briefs & concepts)**
- **Creative strategist** — brief, hook, message, platform specs (see creative production SOP)

**Client** — approves creative before launch; **legal** when the category requires it`,
  },
  {
    title: 'Creative brief → formats',
    body: `Before heavy production, lock a **creative brief** (campaign objective, **key message**, **hook in the first 3 seconds**, platforms, **dimensions** 9:16 / 1:1 / 16:9, CTA, tone, talent/UGC, music, assets due from client, due date).

**Video-specific must-haves**
- **Hook** — what stops the scroll in second 0–3
- **Versioning plan** — hero cut + cutdowns; vertical + square minimum for paid social where we run both
- **Safe zones** — no critical info in bottom ~20% where UI covers

Pull **what’s already working** from recent ad performance when this is for paid (formats, hooks, themes) — per creative production workflow.`,
  },
  {
    title: 'Pipeline — assignment & RAWs',
    body: `**Assignment** — strategist lines up **videographer** and **editor** per client/month; work doesn’t move until people are assigned.

**Shoot & RAWs** — schedule the **shoot**; after the shoot, **raw footage uploads** are the gate: **editing does not start until raws are uploaded** (pipeline: need_to_schedule → waiting_on_shoot → **uploaded**).

If **shoot date has passed** and raws aren’t in, treat it as **overdue** and unblock fast.

Monday.com / Cortex **monthly pipeline** is the operational source of truth for stage and ownership.`,
  },
  {
    title: 'Pipeline — editing & EM approval',
    body: `**Editing** — not_started → editing → **edited** → **em_approved** → scheduled → done; **revising** when EM or client sends changes; **blocked** when something’s missing.

**Rules of thumb**
- Raws uploaded but edit **not_started** is a red flag — editing should kick off
- **Edited** but not **EM-approved** stalls the client handoff — EM is the internal quality gate

**Lead editor** distributes work; high load on the lead can be normal if they coordinate a team below them.`,
  },
  {
    title: 'Client approval & revisions',
    body: `After EM approval, send to the client with **clear context** (what it is, where it runs, what to look for). Prefer **Frame.io / Drive** with **versioned filenames**.

**Revision discipline**
- Document feedback before re-cutting
- Target **fast turnaround** on reasonable rounds; **scope creep** (new concept vs tweak) gets a new conversation

Pipeline: not_sent → **waiting_on_approval** → **client_approved** / **needs_revision** → **sent_to_paid_media** when we’re handing off for paid amplification.

**Regulated categories** — route **legal** after client creative approval where your process requires it; no paid spend without that clearance.`,
  },
  {
    title: 'Delivery, specs & publishing',
    body: `**Technical bar (video)**
- **Captions on every video** — most people watch muted
- **First 3 seconds** carry the hook; recheck trims per placement
- **9:16 + 1:1** (or more) per campaign needs — don’t ship one aspect ratio when the media plan needs several
- **File naming & storage** — client folder + campaign + version (see creative production SOP)

**Go-live**
- **Organic** — schedule in your stack (e.g. Zernio/posting tool); QA previews
- **Paid** — upload to ad accounts, **UTMs**, pass platform review; don’t assume approval without checking

**Influencer / FTC** — disclosures (#ad / paid partnership) when applicable.`,
  },
  {
    title: 'Boosting & learning',
    body: `**SMM** owns boosting workflow once content is approved and ready (pipeline: not_boosting → working_on_it → done).

**Measure like a video shop**
- Hook / hold metrics where platforms expose them
- Paid: CTR, CPA/ROAS vs static alternatives when testing
- Feed **winners** back into the next **brief** and **shoot** plan

Quarterly: refresh **formats and hooks**; retire fatigued creative with intention.`,
  },
  {
    title: 'Timeline & handoffs',
    body: `Creative production workflow (agency standard): **brief → production → internal QA → client approval → delivery** — often **~7 business days** end-to-end for a typical cycle when scope is clear; **rush** only with explicit approval.

Larger **field production** (multi-week shoots, broadcast) follows **video production playbook** timelines — discovery, script, shoot, post, versioning — separate from a single monthly edit batch.

**Handoff clarity** — each stage has one **owner** and a **definition of done** before the next team picks it up.`,
  },
  {
    title: 'How this maps to Cortex',
    body: `- **Research** — topics and ideas feeding briefs and shoot plans
- **Monthly pipeline & shoot calendar** — assignment, shoot, raws, edit, approval, boost
- **Post scheduler / integrations** — publish and amplify
- **Ad creatives** — separate track for static/video **ad creative** generation when that product is in play for the client

This deck is the **human story**; Cortex is where status and handoffs stay visible.`,
  },
];
