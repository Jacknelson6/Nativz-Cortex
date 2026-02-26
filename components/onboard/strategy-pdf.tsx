'use client';

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { ClientStrategy } from '@/lib/types/strategy';
import { NATIVZ_LOGO_PNG, AC_LOGO_PNG } from '@/lib/brand-logo';

const colors = {
  primary: '#046BD2',
  purple: '#8B5CF6',
  bg: '#0f1117',
  surface: '#1a1d2e',
  border: '#2a2f45',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#046BD2',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  white: '#ffffff',
  darkBg: '#0a0c14',
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    padding: 40,
    fontFamily: 'Helvetica',
    color: colors.text,
  },
  coverPage: {
    backgroundColor: colors.darkBg,
    padding: 60,
    fontFamily: 'Helvetica',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 14,
    color: colors.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  coverDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 20,
    textAlign: 'center',
  },
  coverBadge: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 40,
    textAlign: 'center',
    letterSpacing: 2,
  },
  accentLine: {
    width: 60,
    height: 3,
    backgroundColor: colors.primary,
    marginVertical: 20,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  text: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 1.6,
    marginBottom: 8,
  },
  label: {
    fontSize: 9,
    color: colors.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: `${colors.primary}22`,
    color: colors.primary,
    alignSelf: 'flex-start',
  },
  badgeHigh: {
    backgroundColor: `${colors.danger}22`,
    color: colors.danger,
  },
  badgeMedium: {
    backgroundColor: `${colors.warning}22`,
    color: colors.warning,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  col: {
    flex: 1,
  },
  bullet: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    paddingLeft: 12,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: colors.textMuted,
  },
  pillarNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginRight: 8,
    opacity: 0.3,
  },
});

interface StrategyPdfProps {
  strategy: ClientStrategy;
  clientName: string;
  agency?: string | null;
}

export function StrategyPdf({ strategy, clientName, agency }: StrategyPdfProps) {
  const isAC = agency?.toLowerCase().includes('anderson') || agency?.toLowerCase() === 'ac';
  const logo = isAC ? AC_LOGO_PNG : NATIVZ_LOGO_PNG;
  const brandColor = isAC ? '#10B981' : colors.primary;
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      {/* Cover page */}
      <Page size="A4" style={styles.coverPage}>
        <Image src={logo} style={{ width: 160, height: 40, marginBottom: 10, objectFit: 'contain' }} />
        <View style={[styles.accentLine, { backgroundColor: brandColor }]} />
        <Text style={styles.coverTitle}>{clientName}</Text>
        <Text style={[styles.coverSubtitle, { color: brandColor }]}>Content Strategy Playbook</Text>
        <Text style={styles.coverDate}>{date}</Text>
      </Page>

      {/* Executive summary */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Executive summary</Text>
        <Text style={styles.text}>{strategy.executive_summary ?? ''}</Text>

        {/* Audience analysis */}
        {strategy.audience_analysis && (
          <>
            <Text style={{ ...styles.sectionTitle, marginTop: 20 }}>Audience analysis</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Demographics</Text>
              <Text style={styles.text}>{strategy.audience_analysis.demographics}</Text>
              <Text style={styles.label}>Psychographics</Text>
              <Text style={styles.text}>{strategy.audience_analysis.psychographics}</Text>
              <Text style={styles.label}>Online behavior</Text>
              <Text style={styles.text}>{strategy.audience_analysis.online_behavior}</Text>
            </View>
            <View style={styles.row}>
              <View style={{ ...styles.card, flex: 1 }}>
                <Text style={styles.label}>Pain points</Text>
                {(strategy.audience_analysis.pain_points ?? []).map((p, i) => (
                  <Text key={i} style={styles.bullet}>• {p}</Text>
                ))}
              </View>
              <View style={{ ...styles.card, flex: 1 }}>
                <Text style={styles.label}>Aspirations</Text>
                {(strategy.audience_analysis.aspirations ?? []).map((a, i) => (
                  <Text key={i} style={styles.bullet}>• {a}</Text>
                ))}
              </View>
            </View>
          </>
        )}
        <View style={styles.footer}>
          <Text>{isAC ? 'Anderson Collaborative' : 'Nativz'}</Text>
          <Text>{clientName} — Content Strategy</Text>
        </View>
      </Page>

      {/* Content pillars */}
      {(strategy.content_pillars ?? []).length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Content pillars</Text>
          {(strategy.content_pillars ?? []).map((pillar, i) => (
            <View key={i} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.pillarNumber}>0{i + 1}</Text>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.white }}>{pillar.pillar}</Text>
                  <Text style={{ fontSize: 8, color: colors.textMuted }}>{pillar.frequency} • {(pillar.formats ?? []).join(', ')}</Text>
                </View>
              </View>
              <Text style={styles.text}>{pillar.description}</Text>
              {(pillar.hooks ?? []).length > 0 && (
                <View>
                  <Text style={styles.label}>Hook templates</Text>
                  {(pillar.hooks ?? []).map((h, j) => (
                    <Text key={j} style={{ ...styles.text, fontSize: 9, fontStyle: 'italic' }}>&ldquo;{h}&rdquo;</Text>
                  ))}
                </View>
              )}
            </View>
          ))}
          <View style={styles.footer}>
            <Text>{isAC ? 'Anderson Collaborative' : 'Nativz'}</Text>
            <Text>{clientName} — Content Pillars</Text>
          </View>
        </Page>
      )}

      {/* Platform strategy */}
      {(strategy.platform_strategy ?? []).length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Platform strategy</Text>
          {(strategy.platform_strategy ?? []).map((p, i) => (
            <View key={i} style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.white }}>{p.platform}</Text>
                <Text style={{
                  ...styles.badge,
                  ...(p.priority === 'primary' ? {} : p.priority === 'secondary' ? styles.badgeMedium : styles.badgeHigh),
                }}>{p.priority}</Text>
              </View>
              <Text style={styles.text}>{p.rationale}</Text>
              <Text style={{ fontSize: 8, color: colors.textMuted }}>
                {p.posting_cadence} • {(p.content_types ?? []).join(', ')}
              </Text>
            </View>
          ))}

          {/* Trending opportunities on same page if they fit */}
          {(strategy.trending_opportunities ?? []).length > 0 && (
            <>
              <Text style={{ ...styles.sectionTitle, marginTop: 20 }}>Trending opportunities</Text>
              {(strategy.trending_opportunities ?? []).map((t, i) => (
                <View key={i} style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={{
                      ...styles.badge,
                      ...(t.urgency === 'act_now' ? styles.badgeHigh : t.urgency === 'this_week' ? styles.badgeMedium : {}),
                    }}>{(t.urgency ?? '').replace(/_/g, ' ')}</Text>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.white }}>{t.trend}</Text>
                  </View>
                  <Text style={styles.text}>{t.content_angle}</Text>
                </View>
              ))}
            </>
          )}
          <View style={styles.footer}>
            <Text>Nativz</Text>
            <Text>{clientName} — Platforms & Trends</Text>
          </View>
        </Page>
      )}

      {/* Video ideas */}
      {(strategy.video_ideas ?? []).length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Video ideas</Text>
          {(strategy.video_ideas ?? []).map((v, i) => (
            <View key={i} style={styles.card}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.white, marginBottom: 2 }}>{v.title}</Text>
              <Text style={{ fontSize: 9, color: colors.primary, marginBottom: 4 }}>&ldquo;{v.hook}&rdquo;</Text>
              <Text style={{ fontSize: 8, color: colors.textMuted }}>
                {v.format} • {v.platform} • {v.estimated_virality} • {v.pillar}
              </Text>
              <Text style={{ ...styles.text, marginTop: 4 }}>{v.why_it_works}</Text>
            </View>
          ))}
          <View style={styles.footer}>
            <Text>Nativz</Text>
            <Text>{clientName} — Video Ideas</Text>
          </View>
        </Page>
      )}

      {/* Competitive landscape + Next steps */}
      <Page size="A4" style={styles.page}>
        {(strategy.competitive_landscape ?? []).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Competitive landscape</Text>
            {(strategy.competitive_landscape ?? []).map((c, i) => (
              <View key={i} style={styles.card}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.white, marginBottom: 6 }}>{c.competitor}</Text>
                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Strengths</Text>
                    <Text style={styles.text}>{c.strengths}</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Weaknesses</Text>
                    <Text style={styles.text}>{c.weaknesses}</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Opportunity</Text>
                    <Text style={{ ...styles.text, color: colors.success }}>{c.gap_opportunity}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {(strategy.next_steps ?? []).length > 0 && (
          <>
            <Text style={{ ...styles.sectionTitle, marginTop: 20 }}>Next steps — first 30 days</Text>
            {(strategy.next_steps ?? []).map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <Text style={{
                  ...styles.badge,
                  ...(s.priority === 'high' ? styles.badgeHigh : s.priority === 'medium' ? styles.badgeMedium : {}),
                }}>{s.priority}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: colors.text }}>{s.action}</Text>
                  <Text style={{ fontSize: 8, color: colors.textMuted }}>{s.timeline} • {s.category}</Text>
                </View>
              </View>
            ))}
          </>
        )}
        <View style={styles.footer}>
          <Text>Nativz</Text>
          <Text>{clientName} — Competitive & Next Steps</Text>
        </View>
      </Page>
    </Document>
  );
}
