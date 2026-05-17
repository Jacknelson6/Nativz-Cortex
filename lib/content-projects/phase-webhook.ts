/**
 * Phase-change notifier.
 *
 * Fires on every editing_projects.phase transition. Routes:
 *   1. Per-client Google Chat space (clients.chat_webhook_url)
 *   2. Global Ops space (OPS_GOOGLE_CHAT_WEBHOOK_URL env)
 *
 * Both targets receive the same Card V2 payload. We also mirror to
 * activity_log so the Cortex UI can derive a Notifications feed without
 * a separate event table.
 *
 * Failures are intentionally swallowed (logged only) so a Chat outage
 * never blocks a phase change. The activity_log mirror always runs
 * regardless of webhook delivery success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildChatCardMessage, postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import type { EditingProjectPhase } from '@/lib/editing/types';

const OPS_WEBHOOK_ENV = 'OPS_GOOGLE_CHAT_WEBHOOK_URL';

export interface PhaseTransitionEvent {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string | null;
  clientWebhookUrl: string | null;
  fromPhase: EditingProjectPhase | null;
  toPhase: EditingProjectPhase;
  /** Acting user (admin) display name + id, if known. */
  actorId: string | null;
  actorName: string | null;
  /** Absolute origin so the card can deep-link back to the project. */
  origin: string | null;
  /** Optional extra context (raws drive link, video count, etc.). */
  extra?: Record<string, string | number | null | undefined>;
}

function projectUrl(origin: string | null, projectId: string): string | null {
  if (!origin) return null;
  return `${origin.replace(/\/$/, '')}/admin/content-tools?project=${projectId}`;
}

function buildCard(event: PhaseTransitionEvent) {
  const clientLine = event.clientName ?? 'Unassigned client';
  const subtitle = event.fromPhase
    ? `${clientLine} - ${event.fromPhase} -> ${event.toPhase}`
    : `${clientLine} - now ${event.toPhase}`;
  const link = projectUrl(event.origin, event.projectId);
  const extraLines = Object.entries(event.extra ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<b>${k}:</b> ${String(v)}`);

  return buildChatCardMessage({
    cardId: `phase-${event.projectId}-${event.toPhase}`,
    title: event.projectName || 'Untitled project',
    subtitle,
    paragraphs: [
      event.actorName ? `Moved by ${event.actorName}.` : null,
      extraLines.length > 0 ? { html: extraLines.join('<br>') } : null,
    ],
    buttons: link ? [{ text: 'Open in Cortex', url: link }] : undefined,
    fallback: `${event.projectName}: ${event.fromPhase ?? '-'} -> ${event.toPhase}`,
  });
}

/**
 * Fan-out to per-client + Ops webhooks. Non-blocking; failures only
 * surface in server logs.
 */
export function emitPhaseChange(event: PhaseTransitionEvent): void {
  const card = buildCard(event);
  // Per-client first, then Ops. Order doesn't matter for delivery; we
  // dispatch sequentially in a fire-and-forget shape so a single Chat
  // outage on one URL doesn't poison the other.
  postToGoogleChatSafe(event.clientWebhookUrl, card, `phase:${event.projectId}:client`);
  postToGoogleChatSafe(process.env[OPS_WEBHOOK_ENV] ?? null, card, `phase:${event.projectId}:ops`);
}

/**
 * Mirror a phase change to activity_log so the Notifications feed can
 * render a unified history without a separate events table. We use the
 * existing `entity_type: 'client'` slot (which the CHECK constraint
 * allows) and route the project_id into metadata.
 */
export async function logPhaseChange(
  admin: SupabaseClient,
  event: PhaseTransitionEvent,
): Promise<void> {
  try {
    await admin.from('activity_log').insert({
      actor_id: event.actorId,
      action: 'content_project_phase_changed',
      entity_type: 'client',
      entity_id: event.clientId,
      metadata: {
        project_id: event.projectId,
        project_name: event.projectName,
        from_phase: event.fromPhase,
        to_phase: event.toPhase,
        actor_name: event.actorName,
        extra: event.extra ?? null,
      },
    });
  } catch (err) {
    console.error('[phase-webhook] activity_log mirror failed:', err);
  }
}

/**
 * Convenience: emit + log in one call. The two operations are
 * independent (webhooks fire-and-forget, log awaits) so callers can
 * treat this as a single line.
 */
export async function notifyPhaseChange(
  admin: SupabaseClient,
  event: PhaseTransitionEvent,
): Promise<void> {
  emitPhaseChange(event);
  await logPhaseChange(admin, event);
}
