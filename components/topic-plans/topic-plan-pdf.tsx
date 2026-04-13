import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  TopicPlan,
  TopicSeries,
  TopicIdea,
  formatAudience,
  resonanceLabel,
  normalizeResonance,
  totalIdeas,
  totalHighResonance,
} from '@/lib/topic-plans/types';

// ─── Palette ──────────────────────────────────────────────────────────────
const c = {
  bg: '#FFFFFF',
  surface: '#F7F7FA',
  surfaceAccent: '#EEF3FB',
  border: '#E4E4EA',
  ink: '#0F1117',
  muted: '#6A6A7A',
  accent: '#2CC2C6',
  positive: '#10B981',
  positiveBg: '#ECFDF5',
  negative: '#F59E0B',
  negativeBg: '#FEF3C7',
  priority: '#F97316',
  yesBg: '#ECFDF5',
  yesText: '#065F46',
  maybeBg: '#FEF3C7',
  maybeText: '#92400E',
  noBg: '#FEE2E2',
  noText: '#991B1B',
};

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 56,
    backgroundColor: c.bg,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: c.ink,
  },

  // Cover page
  coverWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 30 },
  coverKicker: {
    fontSize: 11,
    color: c.muted,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    marginBottom: 12,
    fontFamily: 'Helvetica-Bold',
  },
  coverTitle: {
    fontSize: 30,
    color: c.ink,
    textAlign: 'center' as const,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 0,
  },
  coverSub: {
    fontSize: 30,
    color: c.accent,
    textAlign: 'center' as const,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 14,
  },
  coverBlurb: {
    fontSize: 11,
    color: c.muted,
    textAlign: 'center' as const,
    fontStyle: 'italic',
    marginBottom: 28,
  },
  counterRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  counterCell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  counterValue: {
    fontSize: 22,
    color: c.accent,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  counterLabel: {
    fontSize: 8,
    color: c.muted,
    textAlign: 'center' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  northStarLine: {
    fontSize: 11,
    color: c.muted,
    textAlign: 'center' as const,
    marginTop: 28,
  },
  northStarValue: { color: c.accent, fontFamily: 'Helvetica-Bold' },

  // Legend page
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: c.ink,
    marginBottom: 8,
    marginTop: 4,
  },
  para: { fontSize: 10, color: c.ink, marginBottom: 10, lineHeight: 1.5 },
  legendRow: { flexDirection: 'row', borderWidth: 1, borderColor: c.border, marginBottom: -1 },
  legendCheckbox: {
    width: 130,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: c.border,
  },
  legendDesc: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, fontSize: 10 },
  legendNote: { marginTop: 16, fontSize: 10, lineHeight: 1.5 },

  // Series header
  seriesKicker: {
    fontSize: 9,
    color: c.muted,
    letterSpacing: 1.2,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  seriesName: {
    fontSize: 22,
    color: c.ink,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  seriesTagline: { fontSize: 11, color: c.muted, marginBottom: 12 },
  seriesStatRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: c.surface,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    paddingVertical: 10,
    marginBottom: 16,
  },
  seriesStatCell: { flex: 1, paddingHorizontal: 8 },
  seriesStatValue: {
    fontSize: 16,
    color: c.ink,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center' as const,
    marginBottom: 2,
  },
  seriesStatLabel: {
    fontSize: 7,
    color: c.muted,
    textAlign: 'center' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },

  // Idea card
  ideaCard: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  ideaHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  ideaTitleCol: { flex: 1, paddingRight: 8 },
  ideaNum: { color: c.muted, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  ideaTitle: { color: c.ink, fontFamily: 'Helvetica-Bold', fontSize: 13, lineHeight: 1.3 },
  ideaTagsCol: { width: 130, alignItems: 'flex-end' as const },
  ideaTagText: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
  ideaSourceLine: { marginBottom: 8, marginTop: 2 },
  ideaSourceLabel: {
    fontSize: 7,
    color: c.muted,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  ideaSourceVal: { fontSize: 9, color: c.ink, fontStyle: 'italic', marginTop: 1 },
  ideaStatRow: { flexDirection: 'row', gap: 6, marginVertical: 8 },
  ideaStatCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  ideaStatValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center' as const,
    marginBottom: 2,
  },
  ideaStatLabel: {
    fontSize: 7,
    color: c.muted,
    textAlign: 'center' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  whyLine: { fontSize: 9.5, color: c.ink, lineHeight: 1.4, marginTop: 6, marginBottom: 8 },
  whyLabel: { fontFamily: 'Helvetica-Bold', color: c.accent, fontSize: 8, letterSpacing: 0.5 },
  selectionRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  selectionCell: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 3,
  },
  selectionLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  selectionNotes: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 3,
    fontSize: 9,
    color: c.muted,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: c.muted,
    textAlign: 'center' as const,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function resonanceColor(r: string | null | undefined): string {
  switch (normalizeResonance(r)) {
    case 'viral': return c.priority;
    case 'high': return c.accent;
    case 'rising': return c.priority;
    case 'medium':
    case 'low':
    default: return c.muted;
  }
}

function sumViewsLabel(plan: TopicPlan): string {
  let sum = 0;
  for (const ser of plan.series) if (ser.total_views) sum += ser.total_views;
  return sum > 0 ? formatAudience(sum) : '';
}

function PageFooter({ clientName }: { clientName: string }) {
  return (
    <Text
      style={s.footer}
      render={({ pageNumber, totalPages }) =>
        `Nativz Cortex  ·  ${clientName}  ·  Page ${pageNumber} of ${totalPages}`
      }
      fixed
    />
  );
}

// ─── Cover page ───────────────────────────────────────────────────────────

function CoverPage({ plan, clientName }: { plan: TopicPlan; clientName: string }) {
  const counters: Array<{ value: string; label: string }> = [
    { value: plan.series.length.toString(), label: plan.series.length === 1 ? 'CONTENT PILLAR' : 'CONTENT PILLARS' },
    { value: totalIdeas(plan).toString(), label: 'VIDEO TOPICS' },
  ];
  const views = sumViewsLabel(plan);
  if (views) counters.push({ value: views, label: 'COMBINED VIEWS' });
  const high = totalHighResonance(plan);
  if (high > 0) counters.push({ value: high.toString(), label: 'HIGH RESONANCE' });

  return (
    <Page size="A4" style={s.page}>
      <View style={s.coverWrap}>
        <Text style={s.coverKicker}>{clientName.toUpperCase()}</Text>
        <Text style={s.coverTitle}>Content Strategy</Text>
        <Text style={s.coverSub}>{plan.title}</Text>
        {plan.subtitle ? <Text style={s.coverBlurb}>{plan.subtitle}</Text> : null}

        <View style={s.counterRow}>
          {counters.map((cnt, i) => (
            <View key={i} style={s.counterCell}>
              <Text style={s.counterValue}>{cnt.value}</Text>
              <Text style={s.counterLabel}>{cnt.label}</Text>
            </View>
          ))}
        </View>

        {plan.north_star_metric ? (
          <Text style={s.northStarLine}>
            North Star Metric:{' '}
            <Text style={s.northStarValue}>{plan.north_star_metric}</Text>
          </Text>
        ) : null}
      </View>
      <PageFooter clientName={clientName} />
    </Page>
  );
}

// ─── Legend page ──────────────────────────────────────────────────────────

function LegendPage({ clientName }: { clientName: string }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>HOW TO USE THIS DOCUMENT</Text>
      <Text style={s.para}>
        Each topic has a selection row at the bottom. Check one box per topic:
      </Text>

      <View style={[s.legendRow, { backgroundColor: c.yesBg }]}>
        <View style={s.legendCheckbox}>
          <Text style={{ fontSize: 10 }}>
            ☐ <Text style={{ fontFamily: 'Helvetica-Bold', color: c.yesText }}>YES — Film This</Text>
          </Text>
        </View>
        <Text style={s.legendDesc}>This topic is approved for scripting and production.</Text>
      </View>
      <View style={[s.legendRow, { backgroundColor: c.maybeBg }]}>
        <View style={s.legendCheckbox}>
          <Text style={{ fontSize: 10 }}>
            ☐ <Text style={{ fontFamily: 'Helvetica-Bold', color: c.maybeText }}>MAYBE — Review</Text>
          </Text>
        </View>
        <Text style={s.legendDesc}>This topic needs further discussion before committing.</Text>
      </View>
      <View style={[s.legendRow, { backgroundColor: c.noBg }]}>
        <View style={s.legendCheckbox}>
          <Text style={{ fontSize: 10 }}>
            ☐ <Text style={{ fontFamily: 'Helvetica-Bold', color: c.noText }}>NO — Skip</Text>
          </Text>
        </View>
        <Text style={s.legendDesc}>This topic is not a priority for this production cycle.</Text>
      </View>

      <Text style={s.legendNote}>
        Topics marked{' '}
        <Text style={{ fontFamily: 'Helvetica-Bold', color: c.priority }}>PRIORITY</Text> are the
        recommended first-film topics based on resonance data.{' '}
        <Text style={{ fontFamily: 'Helvetica-Bold', color: c.accent }}>HIGH RESONANCE</Text>{' '}
        topics generate the most shares, saves, and follows.
      </Text>
      <PageFooter clientName={clientName} />
    </Page>
  );
}

// ─── Series + idea cards ──────────────────────────────────────────────────

function SeriesHeader({ series, index }: { series: TopicSeries; index: number }) {
  const high = series.ideas.filter((i) => {
    const n = normalizeResonance(i.resonance);
    return n === 'high' || n === 'viral';
  }).length;

  const stats: Array<{ value: string; label: string }> = [
    { value: series.ideas.length.toString(), label: 'TOPICS' },
  ];
  if (high > 0) stats.push({ value: high.toString(), label: 'HIGH RESONANCE' });
  if (series.total_views) stats.push({ value: formatAudience(series.total_views), label: 'TOTAL VIEWS' });
  if (series.engagement_rate) stats.push({ value: series.engagement_rate.toFixed(3), label: 'ENGAGEMENT RATE' });

  return (
    <View>
      <Text style={s.seriesKicker}>SERIES {String(index + 1).padStart(2, '0')}</Text>
      <Text style={s.seriesName}>{series.name}</Text>
      {series.tagline ? <Text style={s.seriesTagline}>{series.tagline}</Text> : null}
      <View style={s.seriesStatRow}>
        {stats.map((st, i) => (
          <View key={i} style={s.seriesStatCell}>
            <Text style={s.seriesStatValue}>{st.value}</Text>
            <Text style={s.seriesStatLabel}>{st.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function IdeaCard({ idea, num }: { idea: TopicIdea; num: number }) {
  const tag = resonanceLabel(idea.resonance);
  const tagColor = resonanceColor(idea.resonance);

  // Stat cells — only show what has data, drop the rest entirely.
  const statCells: Array<{ value: string; label: string; bg: string; color: string }> = [];
  const aud = formatAudience(idea.audience ?? undefined);
  if (aud) statCells.push({ value: aud, label: 'AUDIENCE', bg: c.surface, color: c.ink });
  if (idea.positive_pct != null) statCells.push({
    value: `${Math.round(idea.positive_pct)}%`, label: 'POSITIVE', bg: c.positiveBg, color: c.positive,
  });
  if (idea.negative_pct != null) statCells.push({
    value: `${Math.round(idea.negative_pct)}%`, label: 'NEGATIVE', bg: c.negativeBg, color: c.negative,
  });

  return (
    <View style={s.ideaCard} wrap={false}>
      <View style={s.ideaHeaderRow}>
        <View style={s.ideaTitleCol}>
          <Text>
            <Text style={s.ideaNum}>{String(num).padStart(2, '0')}.  </Text>
            <Text style={s.ideaTitle}>{idea.title}</Text>
          </Text>
        </View>
        <View style={s.ideaTagsCol}>
          {tag ? (
            <Text style={[s.ideaTagText, { color: tagColor }]}>{tag} RESONANCE</Text>
          ) : null}
          {idea.priority ? (
            <Text style={[s.ideaTagText, { color: c.priority, marginTop: 2 }]}>PRIORITY</Text>
          ) : null}
        </View>
      </View>

      {idea.source ? (
        <View style={s.ideaSourceLine}>
          <Text style={s.ideaSourceLabel}>SOURCE</Text>
          <Text style={s.ideaSourceVal}>{idea.source}</Text>
        </View>
      ) : null}

      {statCells.length > 0 ? (
        <View style={s.ideaStatRow}>
          {statCells.map((cell, i) => (
            <View key={i} style={[s.ideaStatCell, { backgroundColor: cell.bg }]}>
              <Text style={[s.ideaStatValue, { color: cell.color }]}>{cell.value}</Text>
              <Text style={s.ideaStatLabel}>{cell.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {idea.why_it_works ? (
        <Text style={s.whyLine}>
          <Text style={s.whyLabel}>WHY IT WORKS  </Text>
          {idea.why_it_works}
        </Text>
      ) : null}

      <View style={s.selectionRow}>
        <View style={[s.selectionCell, { backgroundColor: c.yesBg }]}>
          <Text style={[s.selectionLabel, { color: c.yesText }]}>☐ YES — Film This</Text>
        </View>
        <View style={[s.selectionCell, { backgroundColor: c.maybeBg }]}>
          <Text style={[s.selectionLabel, { color: c.maybeText }]}>☐ MAYBE — Review</Text>
        </View>
        <View style={[s.selectionCell, { backgroundColor: c.noBg }]}>
          <Text style={[s.selectionLabel, { color: c.noText }]}>☐ NO — Skip</Text>
        </View>
        <Text style={s.selectionNotes}>Notes: ____________</Text>
      </View>
    </View>
  );
}

// ─── Series page (one per series) ─────────────────────────────────────────

function SeriesPage({
  series,
  index,
  clientName,
}: {
  series: TopicSeries;
  index: number;
  clientName: string;
}) {
  return (
    <Page size="A4" style={s.page}>
      <SeriesHeader series={series} index={index} />
      {series.ideas.map((idea, i) => (
        <IdeaCard key={i} idea={idea} num={idea.number ?? i + 1} />
      ))}
      <PageFooter clientName={clientName} />
    </Page>
  );
}

// ─── Public document ──────────────────────────────────────────────────────

export function TopicPlanPdf({ plan, clientName }: { plan: TopicPlan; clientName: string }) {
  return (
    <Document
      title={plan.title}
      subject={plan.subtitle ?? undefined}
      creator="Nativz Cortex"
    >
      <CoverPage plan={plan} clientName={clientName} />
      <LegendPage clientName={clientName} />
      {plan.series.map((series, i) => (
        <SeriesPage key={i} series={series} index={i} clientName={clientName} />
      ))}
    </Document>
  );
}
