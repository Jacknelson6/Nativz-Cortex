/**
 * Recent deliverable activity loader.
 *
 * Pulls the last N rows of `credit_transactions` for a client and decorates
 * each row with the deliverable type slug + a human-language summary the UI
 * can render directly. Replaces `CreditsViewerLedger`'s table view with
 * something that reads like a calm activity feed.
 *
 * The summary string lives in this file rather than the component so the
 * exact wording is testable and re-usable by future surfaces (e.g. an
 * email digest of "this week's production activity"). Anything client-
 * facing flows through `lib/deliverables/copy.ts` for the type noun.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreditTransactionKind, DeliverableTypeSlug } from '@/lib/credits/types';
import { listDeliverableTypes } from './types-cache';
import { deliverableCopy, pluraliseDeliverable } from './copy';

export interface RecentActivityEntry {
  id: string;
  createdAt: string;
  kind: CreditTransactionKind;
  delta: number;
  deliverableTypeSlug: DeliverableTypeSlug;
  /** Headline summary, sentence case, no trailing period. */
  headline: string;
  /** Optional detail line (e.g. note, post title). */
  detail?: string | null;
  /**
   * Drop-video thumbnail URL when the row charges a drop_video unit. Lets
   * the activity feed render a visual marker so the operator can scan
   * "which post was that?" at a glance.
   */
  thumbnailUrl?: string | null;
}

const DEFAULT_LIMIT = 30;

interface TxJoinRow {
  id: string;
  client_id: string;
  deliverable_type_id: string;
  kind: CreditTransactionKind;
  delta: number;
  charge_unit_kind: string | null;
  charge_unit_id: string | null;
  scheduled_post_id: string | null;
  note: string | null;
  reviewer_email: string | null;
  created_at: string;
}

export async function getRecentDeliverableActivity(
  admin: SupabaseClient,
  clientId: string,
  options: { limit?: number } = {},
): Promise<RecentActivityEntry[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;

  const [types, txResult] = await Promise.all([
    listDeliverableTypes(admin),
    admin
      .from('credit_transactions')
      .select(
        'id, client_id, deliverable_type_id, kind, delta, charge_unit_kind, charge_unit_id, scheduled_post_id, note, reviewer_email, created_at',
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<TxJoinRow[]>(),
  ]);

  const slugById = new Map(types.map((t) => [t.id, t.slug]));
  const rows = txResult.data ?? [];

  // Pull post titles + drop-video thumbnails in one batch each. The post
  // titles keep "Hot Take #4 approved" reading natural; the thumbnails let
  // the activity feed render a visual marker so the operator can scan
  // which post a row refers to without clicking through. Both batches run
  // in parallel because they're independent.
  const postIds = rows
    .map((r) => r.scheduled_post_id)
    .filter((v): v is string => !!v);
  const dropVideoIds = rows
    .filter((r) => r.charge_unit_kind === 'drop_video' && !!r.charge_unit_id)
    .map((r) => r.charge_unit_id as string);

  const [postTitleResult, dropVideoResult] = await Promise.all([
    postIds.length > 0
      ? admin
          .from('scheduled_posts')
          .select('id, title')
          .in('id', postIds)
          .returns<Array<{ id: string; title: string | null }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
    dropVideoIds.length > 0
      ? admin
          .from('content_drop_videos')
          .select('id, thumbnail_url')
          .in('id', dropVideoIds)
          .returns<Array<{ id: string; thumbnail_url: string | null }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; thumbnail_url: string | null }> }),
  ]);

  const titleByPostId = new Map(
    (postTitleResult.data ?? [])
      .filter((p): p is { id: string; title: string } => !!p.title)
      .map((p) => [p.id, p.title]),
  );
  const thumbnailByDropVideoId = new Map(
    (dropVideoResult.data ?? [])
      .filter((v): v is { id: string; thumbnail_url: string } => !!v.thumbnail_url)
      .map((v) => [v.id, v.thumbnail_url]),
  );

  const out: RecentActivityEntry[] = [];
  for (const row of rows) {
    const slug = slugById.get(row.deliverable_type_id);
    if (!slug) continue; // unknown type; skip rather than guess
    const summary = summarise(row, slug, titleByPostId);
    const thumbnailUrl =
      row.charge_unit_kind === 'drop_video' && row.charge_unit_id
        ? (thumbnailByDropVideoId.get(row.charge_unit_id) ?? null)
        : null;
    out.push({
      id: row.id,
      createdAt: row.created_at,
      kind: row.kind,
      delta: row.delta,
      deliverableTypeSlug: slug,
      headline: summary.headline,
      detail: summary.detail,
      thumbnailUrl,
    });
  }
  return out;
}

function summarise(
  row: TxJoinRow,
  slug: DeliverableTypeSlug,
  titleByPostId: Map<string, string>,
): { headline: string; detail: string | null } {
  const copy = deliverableCopy(slug);
  const absDelta = Math.abs(row.delta);
  const postTitle =
    row.scheduled_post_id ? (titleByPostId.get(row.scheduled_post_id) ?? null) : null;

  switch (row.kind) {
    case 'grant_monthly': {
      return {
        headline: 'Monthly scope refilled',
        detail:
          row.delta > 0
            ? `${pluraliseDeliverable(slug, row.delta)} added`
            : null,
      };
    }
    case 'grant_topup': {
      return {
        headline: `${pluraliseDeliverable(slug, absDelta)} added (top-up)`,
        detail: row.note?.trim() || null,
      };
    }
    case 'consume': {
      const noun = absDelta === 1 ? copy.singular : copy.plural;
      const headline = postTitle
        ? `${absDelta} ${noun} used, ${postTitle} approved`
        : `${absDelta} ${noun} used`;
      return { headline, detail: row.reviewer_email ?? null };
    }
    case 'refund': {
      return {
        headline: `${pluraliseDeliverable(slug, absDelta)} returned`,
        detail: row.note?.trim() || 'Approval reversed',
      };
    }
    case 'adjust': {
      const direction = row.delta > 0 ? 'added' : 'removed';
      return {
        headline: `${pluraliseDeliverable(slug, absDelta)} ${direction} (adjustment)`,
        detail: row.note?.trim() || null,
      };
    }
    case 'expire': {
      return {
        headline: `${pluraliseDeliverable(slug, absDelta)} expired`,
        detail: row.note?.trim() || null,
      };
    }
  }
}
