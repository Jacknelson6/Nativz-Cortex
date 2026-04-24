import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_DETECTORS } from './detectors';
import type { Detector } from './types';
import { notifyAdmins } from '@/lib/lifecycle/notify';

type RunSummary = {
  detector: string;
  severity: string;
  total: number;
  new: number;
  updated: number;
  resolved: number;
};

/**
 * Run every detector and reconcile findings against revenue_anomalies.
 * Reconciliation rules:
 *   - For each finding: upsert by (detector, entity_type, entity_id) —
 *     on conflict, update last_detected_at + title/description/metadata and
 *     clear resolved_at (the anomaly is back).
 *   - For any existing open anomaly for this detector that is NOT in the
 *     current batch: set resolved_at = now() (the anomaly cleared).
 *   - For net-new error-severity anomalies: fire an admin notification.
 */
export async function runAllDetectors(admin: SupabaseClient): Promise<RunSummary[]> {
  const summaries: RunSummary[] = [];
  const newErrors: Array<{ detector: Detector; title: string }> = [];

  for (const detector of ALL_DETECTORS) {
    try {
      const findings = await detector.detect(admin);
      const currentKeys = new Set<string>();

      let newCount = 0;
      let updatedCount = 0;

      for (const f of findings) {
        const { data: existing } = await admin
          .from('revenue_anomalies')
          .select('id, resolved_at, dismissed_at')
          .eq('detector', detector.id)
          .eq('entity_type', f.entity_type ?? '')
          .eq('entity_id', f.entity_id ?? '')
          .maybeSingle();

        if (existing) {
          await admin
            .from('revenue_anomalies')
            .update({
              last_detected_at: new Date().toISOString(),
              title: f.title,
              description: f.description ?? null,
              metadata: f.metadata ?? {},
              severity: detector.severity,
              client_id: f.client_id ?? null,
              resolved_at: null,
            })
            .eq('id', existing.id);
          updatedCount += 1;
        } else {
          await admin.from('revenue_anomalies').insert({
            detector: detector.id,
            severity: detector.severity,
            entity_type: f.entity_type ?? null,
            entity_id: f.entity_id ?? null,
            client_id: f.client_id ?? null,
            title: f.title,
            description: f.description ?? null,
            metadata: f.metadata ?? {},
          });
          newCount += 1;
          if (detector.severity === 'error') {
            newErrors.push({ detector, title: f.title });
          }
        }
        currentKeys.add(`${f.entity_type ?? ''}::${f.entity_id ?? ''}`);
      }

      // Resolve any previously-open anomalies for this detector that are no
      // longer in the current batch.
      const { data: openForDetector } = await admin
        .from('revenue_anomalies')
        .select('id, entity_type, entity_id')
        .eq('detector', detector.id)
        .is('resolved_at', null)
        .is('dismissed_at', null);

      let resolvedCount = 0;
      for (const row of openForDetector ?? []) {
        const key = `${row.entity_type ?? ''}::${row.entity_id ?? ''}`;
        if (!currentKeys.has(key)) {
          await admin
            .from('revenue_anomalies')
            .update({ resolved_at: new Date().toISOString() })
            .eq('id', row.id);
          resolvedCount += 1;
        }
      }

      summaries.push({
        detector: detector.id,
        severity: detector.severity,
        total: findings.length,
        new: newCount,
        updated: updatedCount,
        resolved: resolvedCount,
      });
    } catch (err) {
      console.error(`[anomalies] detector '${detector.id}' threw:`, err);
      summaries.push({
        detector: detector.id,
        severity: detector.severity,
        total: 0,
        new: 0,
        updated: 0,
        resolved: 0,
      });
    }
  }

  if (newErrors.length > 0) {
    const title = `Revenue anomaly: ${newErrors.length} new error-level finding${
      newErrors.length === 1 ? '' : 's'
    }`;
    const message = newErrors
      .slice(0, 5)
      .map((e) => `• ${e.title}`)
      .join('\n');
    await notifyAdmins(admin, 'revenue_anomaly', title, { message });
  }

  return summaries;
}
