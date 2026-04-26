import type { SupabaseClient } from '@supabase/supabase-js';
import type { SegmentKind } from '@/lib/onboarding/flows';

/**
 * Tier-aware onboarding blueprint instantiation.
 *
 * Migration 167 stores per-tier intake structure on `proposal_templates.tier_intake_blueprint`.
 * On proposal sign, `instantiateBlueprintForFlow` walks the chosen tier's segments → groups → items
 * and creates the matching `onboarding_trackers` + `onboarding_flow_segments` +
 * `onboarding_checklist_groups` + `onboarding_checklist_items` rows.
 *
 * The function is idempotent at the (template_key, group_name, tracker_service) level:
 *   - Trackers are upserted by (client_id, service)
 *   - Flow segments are upserted by (flow_id, kind)
 *   - Groups dedupe by (tracker_id, name)
 *   - Items dedupe by (group_id, template_key)
 *
 * This means re-running the same blueprint is safe, and *appending* a new tier or service
 * to an existing flow merges cleanly (Jack's preference: append a segment, don't fork the flow).
 */

type AdminClient = SupabaseClient;

export type IntakeItemKind =
  | 'simple_check'
  | 'drive_link'
  | 'oauth_socials'
  | 'email_list'
  | 'schedule_meeting'
  | 'text_response'
  | 'agency_followup';

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';

export interface BlueprintItem {
  key: string;
  task: string;
  owner: 'agency' | 'client';
  kind: IntakeItemKind;
  required?: boolean;
  description?: string;
  platform?: SocialPlatform;
}

export interface BlueprintGroup {
  name: string;
  items: BlueprintItem[];
}

export interface BlueprintSegment {
  kind: SegmentKind;
  title: string;
  groups: BlueprintGroup[];
}

export interface BlueprintTier {
  segments: BlueprintSegment[];
}

export interface TierIntakeBlueprint {
  tiers: Record<string, BlueprintTier>;
}

export interface InstantiateBlueprintArgs {
  admin: AdminClient;
  flowId: string;
  templateId: string;
  tierId: string;
  clientId: string;
}

export interface InstantiateBlueprintResult {
  segmentsCreated: number;
  segmentsExisting: number;
  itemsCreated: number;
  itemsExisting: number;
}

export async function instantiateBlueprintForFlow(
  args: InstantiateBlueprintArgs,
): Promise<InstantiateBlueprintResult> {
  const { admin, flowId, templateId, tierId, clientId } = args;

  const { data: template, error: templateError } = await admin
    .from('proposal_templates')
    .select('id, tier_intake_blueprint')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    throw new Error(
      `instantiateBlueprintForFlow: template ${templateId} not found (${templateError?.message ?? 'unknown'})`,
    );
  }

  const blueprint = template.tier_intake_blueprint as TierIntakeBlueprint | null;
  const tier = blueprint?.tiers?.[tierId];
  if (!tier || !Array.isArray(tier.segments)) {
    throw new Error(
      `instantiateBlueprintForFlow: tier "${tierId}" has no blueprint on template ${templateId}`,
    );
  }

  await admin
    .from('onboarding_flows')
    .update({ template_id: templateId, tier_id: tierId })
    .eq('id', flowId);

  let segmentsCreated = 0;
  let segmentsExisting = 0;
  let itemsCreated = 0;
  let itemsExisting = 0;

  for (let segmentIdx = 0; segmentIdx < tier.segments.length; segmentIdx++) {
    const segment = tier.segments[segmentIdx];

    const { data: existingTracker } = await admin
      .from('onboarding_trackers')
      .select('id')
      .eq('client_id', clientId)
      .eq('service', segment.kind)
      .eq('is_template', false)
      .maybeSingle();

    let trackerId: string;
    if (existingTracker) {
      trackerId = existingTracker.id;
    } else {
      const { data: tracker, error: trackerError } = await admin
        .from('onboarding_trackers')
        .insert({
          client_id: clientId,
          service: segment.kind,
          title: segment.title,
          status: 'active',
          is_template: false,
        })
        .select('id')
        .single();
      if (trackerError || !tracker) {
        throw new Error(
          `tracker insert failed for service "${segment.kind}": ${trackerError?.message ?? 'unknown'}`,
        );
      }
      trackerId = tracker.id;
    }

    const { data: existingSegment } = await admin
      .from('onboarding_flow_segments')
      .select('id')
      .eq('flow_id', flowId)
      .eq('kind', segment.kind)
      .maybeSingle();

    if (existingSegment) {
      segmentsExisting++;
    } else {
      const { error: segmentError } = await admin
        .from('onboarding_flow_segments')
        .insert({
          flow_id: flowId,
          kind: segment.kind,
          tracker_id: trackerId,
          position: segmentIdx,
          status: 'pending',
        });
      if (segmentError) {
        throw new Error(
          `flow_segment insert failed for kind "${segment.kind}": ${segmentError.message}`,
        );
      }
      segmentsCreated++;
    }

    for (let groupIdx = 0; groupIdx < segment.groups.length; groupIdx++) {
      const group = segment.groups[groupIdx];

      const { data: existingGroup } = await admin
        .from('onboarding_checklist_groups')
        .select('id')
        .eq('tracker_id', trackerId)
        .eq('name', group.name)
        .maybeSingle();

      let groupId: string;
      if (existingGroup) {
        groupId = existingGroup.id;
      } else {
        const { data: newGroup, error: groupError } = await admin
          .from('onboarding_checklist_groups')
          .insert({ tracker_id: trackerId, name: group.name, sort_order: groupIdx })
          .select('id')
          .single();
        if (groupError || !newGroup) {
          throw new Error(
            `group insert failed for "${group.name}": ${groupError?.message ?? 'unknown'}`,
          );
        }
        groupId = newGroup.id;
      }

      const itemKeys = group.items.map((item) => item.key);
      const priorKeys = new Set<string>();
      if (itemKeys.length > 0) {
        const { data: priorItems } = await admin
          .from('onboarding_checklist_items')
          .select('template_key')
          .eq('group_id', groupId)
          .in('template_key', itemKeys);
        for (const row of priorItems ?? []) {
          if (row.template_key) priorKeys.add(row.template_key);
        }
      }

      const itemsToInsert = group.items
        .map((item, itemIdx) => ({ item, itemIdx }))
        .filter(({ item }) => !priorKeys.has(item.key))
        .map(({ item, itemIdx }) => {
          const data: Record<string, unknown> = {};
          if (item.kind === 'oauth_socials' && item.platform) data.platform = item.platform;
          return {
            group_id: groupId,
            task: item.task,
            description: item.description ?? null,
            owner: item.owner,
            status: 'pending',
            sort_order: itemIdx,
            kind: item.kind,
            template_key: item.key,
            required: item.required ?? false,
            data,
          };
        });

      itemsExisting += group.items.length - itemsToInsert.length;

      if (itemsToInsert.length > 0) {
        const { error: itemError } = await admin
          .from('onboarding_checklist_items')
          .insert(itemsToInsert);
        if (itemError) {
          throw new Error(
            `bulk item insert failed for group "${group.name}": ${itemError.message}`,
          );
        }
        itemsCreated += itemsToInsert.length;
      }
    }
  }

  return { segmentsCreated, segmentsExisting, itemsCreated, itemsExisting };
}

export function readBlueprint(
  template: { tier_intake_blueprint: unknown },
): TierIntakeBlueprint | null {
  const raw = template.tier_intake_blueprint;
  if (!raw || typeof raw !== 'object') return null;
  const tiers = (raw as { tiers?: unknown }).tiers;
  if (!tiers || typeof tiers !== 'object') return null;
  return raw as TierIntakeBlueprint;
}

export function getTier(
  blueprint: TierIntakeBlueprint | null,
  tierId: string,
): BlueprintTier | null {
  if (!blueprint) return null;
  return blueprint.tiers[tierId] ?? null;
}
