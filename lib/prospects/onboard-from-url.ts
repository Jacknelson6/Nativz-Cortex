// SPY-02 T05: server-side orchestrator that turns a pasted URL into a
// persisted prospect row + detection payload. Calls classifier →
// detect-socials → dedupe check → insert prospect + state_change
// touchpoint. The HTTP route layer is a thin wrapper around this.
//
// Idempotent (PRD D-04): dedupe by canonicalised website host OR
// (primary_platform, primary_handle). When matched, returns the existing
// row with `existed: true` so the UI can route to the prospect page
// without creating dupes.

import { createAdminClient } from '@/lib/supabase/admin';
import type { ProspectPlatform, ProspectRow } from './types';
import { classifyUrl, type UrlClassification } from './url-classifier';
import { detectSocials, type DetectionResult } from './detect-socials';

const PRIMARY_PLATFORM_ORDER: ProspectPlatform[] = ['tiktok', 'instagram', 'youtube', 'facebook'];

export interface OnboardOutcome {
  prospect: ProspectRow;
  detection: DetectionResult & {
    classified_as: 'website' | 'social_profile';
    platform_seed: ProspectPlatform | null;
  };
  existed: boolean;
}

export type OnboardError =
  | { kind: 'invalid_url'; message: string }
  | { kind: 'classification_failed'; message: string }
  | { kind: 'persistence_failed'; message: string };

export async function onboardFromUrl(opts: {
  url: string;
  createdBy: string;
  brandNameHint?: string | null;
  /** Required agency tag — Nativz or Anderson Collaborative. Persisted on
   *  the prospect row so conversion to client carries forward the right
   *  brand. Post-Victory incident hardening. */
  agency: 'Nativz' | 'Anderson Collaborative';
}): Promise<OnboardOutcome | { error: OnboardError }> {
  const classification = classifyUrl(opts.url);
  if (!classification) {
    return {
      error: { kind: 'classification_failed', message: 'Could not classify URL. Paste a website or social profile link.' },
    };
  }

  const detection = await detectSocials({ classification });
  if (opts.brandNameHint && opts.brandNameHint.trim() && !detection.brand_name) {
    detection.brand_name = opts.brandNameHint.trim();
  }

  const admin = createAdminClient();

  // Dedupe step. We check the two cheapest signals: canonicalised
  // website host and the (primary_platform, primary_handle) tuple. If
  // the rep is re-pasting an already-saved URL we open the existing
  // record instead of creating a dupe.
  const existing = await findExistingProspect({
    admin,
    websiteHost: hostFromUrl(detection.website_url ?? classification.canonicalUrl),
    primary: pickPrimary(classification, detection),
  });

  if (existing) {
    return {
      prospect: existing,
      detection: {
        ...detection,
        classified_as: classification.kind,
        platform_seed: classification.kind === 'social_profile' ? classification.platform : null,
      },
      existed: true,
    };
  }

  // Insert prospect row + initial touchpoint atomically-ish: two
  // statements; if the touchpoint fails we don't roll back the prospect
  // (deliberate — prospect creation is the user-facing win, the
  // touchpoint is a history nicety).
  const primary = pickPrimary(classification, detection);
  const inserted = await admin
    .from('prospects')
    .insert({
      brand_name: detection.brand_name,
      website_url: detection.website_url,
      primary_platform: primary?.platform ?? null,
      primary_handle: primary?.handle ?? null,
      niche: null,
      lifecycle_state: 'discovered',
      source: 'manual',
      source_ref_id: null,
      owner_user_id: opts.createdBy,
      created_by: opts.createdBy,
      agency: opts.agency,
      // Detection failure is surfaced both in the API response and in
      // metadata so a later "resume detection" surface can see the gap.
      // Stashed under `notes` until we add a structured field — keeps
      // SPY-02 migration-free per PRD ("No migration in this PRD").
      notes: detection.detection_failed
        ? `Auto-detect failed: ${detection.detection_message ?? 'unknown error'}`
        : null,
    })
    .select('*')
    .single();

  if (inserted.error || !inserted.data) {
    return {
      error: {
        kind: 'persistence_failed',
        message: inserted.error?.message ?? 'Failed to create prospect',
      },
    };
  }

  const prospect = inserted.data as ProspectRow;
  // Fire-and-forget touchpoint so a slow insert doesn't block the
  // already-successful prospect creation.
  void admin.from('prospect_touchpoints').insert({
    prospect_id: prospect.id,
    kind: 'state_change',
    body: 'Onboarded via quick paste',
    metadata: {
      seed_url: opts.url,
      classified_as: classification.kind,
      platform_seed: classification.kind === 'social_profile' ? classification.platform : null,
      detection_failed: detection.detection_failed,
    },
    created_by: opts.createdBy,
  });

  return {
    prospect,
    detection: {
      ...detection,
      classified_as: classification.kind,
      platform_seed: classification.kind === 'social_profile' ? classification.platform : null,
    },
    existed: false,
  };
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function pickPrimary(
  classification: UrlClassification,
  detection: DetectionResult,
): { platform: ProspectPlatform; handle: string } | null {
  if (classification.kind === 'social_profile') {
    return { platform: classification.platform, handle: classification.handle };
  }
  if (detection.socials.length === 0) return null;
  for (const p of PRIMARY_PLATFORM_ORDER) {
    const match = detection.socials.find((s) => s.platform === p && s.handle);
    if (match) return { platform: p, handle: match.handle };
  }
  const first = detection.socials.find((s) => s.handle);
  return first ? { platform: first.platform, handle: first.handle } : null;
}

async function findExistingProspect(opts: {
  admin: ReturnType<typeof createAdminClient>;
  websiteHost: string | null;
  primary: { platform: ProspectPlatform; handle: string } | null;
}): Promise<ProspectRow | null> {
  // Two lookups, run in parallel — both are bounded and tiny.
  const queries: Array<Promise<{ data: ProspectRow[] | null }>> = [];

  if (opts.websiteHost) {
    // Match any prospect whose website_url contains the same host. The
    // ilike-pattern is bounded by host length so this stays fast on the
    // indexed website_url column (B-tree present from SPY-01).
    queries.push(
      Promise.resolve(
        opts.admin
          .from('prospects')
          .select('*')
          .ilike('website_url', `%${opts.websiteHost}%`)
          .is('archived_at', null)
          .limit(5),
      ).then((r) => ({ data: r.data as ProspectRow[] | null })),
    );
  }
  if (opts.primary) {
    queries.push(
      Promise.resolve(
        opts.admin
          .from('prospects')
          .select('*')
          .eq('primary_platform', opts.primary.platform)
          .eq('primary_handle', opts.primary.handle)
          .is('archived_at', null)
          .limit(1),
      ).then((r) => ({ data: r.data as ProspectRow[] | null })),
    );
  }
  if (queries.length === 0) return null;

  const results = await Promise.all(queries);
  // Prefer the (platform, handle) match — it's a tighter signal than
  // host-substring. Falls back to host match when only that's set.
  if (opts.primary) {
    const handleResult = results[results.length - 1];
    if (handleResult?.data && handleResult.data.length > 0) return handleResult.data[0];
  }
  if (opts.websiteHost) {
    const hostResult = results[0];
    const host = opts.websiteHost.toLowerCase();
    const match = hostResult?.data?.find((p) => {
      try {
        const h = p.website_url ? new URL(p.website_url).hostname.replace(/^www\./, '').toLowerCase() : null;
        return h === host;
      } catch {
        return false;
      }
    });
    if (match) return match;
  }
  return null;
}
