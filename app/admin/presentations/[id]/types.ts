// ─── Creative benchmarks presentation (only type supported in admin UI) ─────

export interface BenchmarkConfig {
  visible_sections: string[];
  section_order: string[];
  active_vertical_filter: string | null;
}

export interface PresentationData {
  id: string;
  title: string;
  description: string | null;
  /** DB may contain legacy values; admin UI only supports `benchmarks`. */
  type: string;
  client_id: string | null;
  audit_data: unknown;
  status: 'draft' | 'ready' | 'archived';
  tags: string[];
}
