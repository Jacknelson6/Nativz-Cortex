/**
 * Data shape for a branded deliverable PDF. Produced by skills like
 * /generate video-ideas, /generate audit, /generate content-plan and
 * rendered by `BrandedDeliverableDocument` with the theme of the
 * current agency.
 *
 * Layout mirrors the "Truck Parking Safety Video Ideas" deliverable
 * but with the interactive YES/MAYBE/NO rows stripped — formal, read-only,
 * delivery-grade documents.
 */

export interface BrandedDeliverableStat {
  /** Big number (e.g. "40", "8"). Rendered as-is — strings are fine. */
  value: string;
  /** Small uppercase label under the number. */
  label: string;
}

export interface BrandedDeliverableMetric {
  /** Label above the number ("AUDIENCE", "POSITIVE", "NEGATIVE"). */
  label: string;
  /** Rendered value (e.g. "68", "0%", "62%"). */
  value: string;
  /** Tint the tile — maps to theme tokens: 'neutral' | 'positive' | 'negative'. */
  tone?: 'neutral' | 'positive' | 'negative';
}

export interface BrandedDeliverableTopic {
  /** Display number — "01.", "02.", etc. */
  number: string;
  /** Topic title — "What happens when every truck stop is full". */
  title: string;
  /** Small label under the title ("SOURCE"). */
  sourceLabel?: string;
  /** Source name — "Overnight truck parking stress". */
  source?: string;
  /** Top-right resonance badge (e.g. "VIRAL RESONANCE"). */
  resonanceLabel?: string;
  /** Optional secondary top-right tag ("PRIORITY"). */
  priorityLabel?: string;
  /** Metric tiles — rendered in a 3-up row. */
  metrics: BrandedDeliverableMetric[];
  /** "Why it works" caption below the metrics. */
  whyItWorks?: string;
}

export interface BrandedDeliverableSeries {
  /** Eyebrow label — "SERIES 01". */
  label: string;
  /** Series title — "Night Arrival & Overnight Parking". */
  title: string;
  /** One-line subtitle below the title. */
  subtitle?: string;
  /** Optional stat strip under the title ("11 TOPICS", "8 HIGH RESONANCE"). */
  stats?: BrandedDeliverableStat[];
  /** Topic cards in this series. */
  topics: BrandedDeliverableTopic[];
}

export interface BrandedDeliverableLegendItem {
  /** Row label (e.g. "PRIORITY"). */
  label: string;
  /** Description. */
  description: string;
  /** Tone maps to theme tokens. */
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'primary';
}

export interface BrandedDeliverableData {
  // ── Cover ──────────────────────────────────────────────────────────
  /** Small uppercase eyebrow (e.g. client name). */
  eyebrow?: string;
  /** Medium kicker above the main title ("Content Strategy"). */
  kicker?: string;
  /** Main title in brand primary color. */
  title: string;
  /** One-paragraph subtitle under the title. */
  summary?: string;
  /** 2–4 stat tiles directly under the summary. */
  stats?: BrandedDeliverableStat[];
  /** Single highlighted call-out ("North Star Metric: …"). */
  highlight?: { label: string; value: string };

  // ── Optional "how to read" page ───────────────────────────────────
  legend?: {
    heading?: string;
    intro?: string;
    items?: BrandedDeliverableLegendItem[];
    footnote?: string;
  };

  // ── Body ──────────────────────────────────────────────────────────
  series: BrandedDeliverableSeries[];

  // ── Running header / footer metadata ──────────────────────────────
  /** Short title for the header strip ("Safe Stop"). Defaults to eyebrow/title. */
  runningHeaderTitle?: string;
  /** Optional product-line label — "Nativz Cortex", "AC Intelligence". Defaults to agency theme product name. */
  runningHeaderProduct?: string;
}
