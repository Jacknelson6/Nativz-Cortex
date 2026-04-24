import type { SupabaseClient } from '@supabase/supabase-js';

export type AnomalySeverity = 'info' | 'warning' | 'error';

export type AnomalyFinding = {
  entity_type: string | null;
  entity_id: string | null;
  client_id: string | null;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type Detector = {
  id: string;
  severity: AnomalySeverity;
  /** One-line description shown in the admin UI next to each finding. */
  label: string;
  /** Longer explanation of why this anomaly matters — shown on hover. */
  rationale: string;
  detect(admin: SupabaseClient): Promise<AnomalyFinding[]>;
};
