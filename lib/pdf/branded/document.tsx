import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { Document, Font, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { AgencyTheme } from '@/lib/branding';

// ── Font registration ─────────────────────────────────────────────
// Rubik + Roboto variable TTFs live in /public/fonts. Registering the
// same file under multiple weights lets react-pdf pick glyph styles
// per fontWeight declaration in our StyleSheet.
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const RUBIK = path.join(FONT_DIR, 'Rubik.ttf');
const RUBIK_ITALIC = path.join(FONT_DIR, 'Rubik-Italic.ttf');
const ROBOTO = path.join(FONT_DIR, 'Roboto.ttf');
const ROBOTO_ITALIC = path.join(FONT_DIR, 'Roboto-Italic.ttf');

let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  if (!fs.existsSync(RUBIK) || !fs.existsSync(ROBOTO)) return;
  Font.register({
    family: 'Rubik',
    fonts: [
      { src: RUBIK, fontWeight: 400 },
      { src: RUBIK, fontWeight: 500 },
      { src: RUBIK, fontWeight: 700 },
      { src: RUBIK, fontWeight: 800 },
      { src: RUBIK_ITALIC, fontWeight: 400, fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: ROBOTO, fontWeight: 400 },
      { src: ROBOTO, fontWeight: 500 },
      { src: ROBOTO, fontWeight: 700 },
      { src: ROBOTO_ITALIC, fontWeight: 400, fontStyle: 'italic' },
    ],
  });
}
import type {
  BrandedDeliverableData,
  BrandedDeliverableLegendItem,
  BrandedDeliverableMetric,
  BrandedDeliverableSeries,
  BrandedDeliverableStat,
  BrandedDeliverableTopic,
} from './types';

// ── Helpers ────────────────────────────────────────────────────────

const withAlpha = (hex: string, alpha: number): string => {
  const a = Math.max(0, Math.min(1, alpha));
  const cleaned = hex.replace('#', '');
  const value = cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Read a PNG from /public at render time and return as Buffer for <Image src>. */
function readLogoBuffer(publicPath: string): Buffer | null {
  try {
    const abs = path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
    return fs.readFileSync(abs);
  } catch {
    return null;
  }
}

function toneTileStyles(theme: AgencyTheme, tone: BrandedDeliverableMetric['tone']) {
  switch (tone) {
    case 'positive':
      return { bg: '#E8F6EE', text: '#1F8A4C' };
    case 'negative':
      return { bg: '#FDF2DC', text: '#B06A13' };
    default:
      return { bg: '#F4F6F8', text: theme.colors.textDark };
  }
}

// ── Styles ─────────────────────────────────────────────────────────

function buildStyles(theme: AgencyTheme) {
  return StyleSheet.create({
    page: {
      paddingTop: 64,
      paddingHorizontal: 56,
      paddingBottom: 80,
      fontFamily: 'Roboto',
      fontSize: 10,
      color: theme.colors.textBody,
      backgroundColor: theme.colors.white,
    },

    // Running header
    runningHeader: {
      position: 'absolute',
      top: 28,
      left: 56,
      right: 56,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    runningHeaderText: {
      fontSize: 8,
      color: theme.colors.textMuted,
      letterSpacing: 1.2,
      fontFamily: 'Roboto',
    },
    runningHeaderStrong: {
      fontSize: 8,
      color: theme.colors.textDark,
      letterSpacing: 1.2,
      fontFamily: 'Rubik',
      fontWeight: 700,
    },

    // Footer
    footer: {
      position: 'absolute',
      bottom: 36,
      left: 56,
      right: 56,
    },
    footerRule: {
      height: 1,
      backgroundColor: theme.colors.primary,
      marginBottom: 10,
    },
    footerInner: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerText: { fontSize: 8.5, color: theme.colors.textMuted, letterSpacing: 0.5 },
    footerSep: { fontSize: 8.5, color: theme.colors.border, marginHorizontal: 10 },

    // ── Cover ─────────────────────────────────────────────────────
    coverPage: {
      padding: 64,
      fontFamily: 'Roboto',
      fontSize: 10,
      color: theme.colors.textBody,
      backgroundColor: theme.colors.white,
      flexDirection: 'column',
    },
    coverTopPad: { flexGrow: 1, minHeight: 80 },
    coverLogoWrap: {
      alignItems: 'center',
      marginBottom: 56,
    },
    coverLogo: { height: 64, objectFit: 'contain' },
    coverRuleWrap: { alignItems: 'center', marginBottom: 22 },
    coverRule: {
      width: 220,
      height: 1,
      backgroundColor: theme.colors.primary,
    },
    coverKicker: {
      fontSize: 13,
      letterSpacing: 5,
      textAlign: 'center',
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.textDark,
      marginBottom: 14,
    },
    coverTitle: {
      fontSize: 34,
      textAlign: 'center',
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.textDark,
      lineHeight: 1.15,
      marginBottom: 18,
      letterSpacing: 0.5,
    },
    coverTitleAccent: {
      fontSize: 34,
      textAlign: 'center',
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.primary,
      lineHeight: 1.15,
      marginBottom: 18,
      letterSpacing: 0.5,
    },
    coverSubtitle: {
      fontSize: 11,
      textAlign: 'center',
      color: theme.colors.primary,
      fontFamily: 'Rubik',
      fontWeight: 700,
      letterSpacing: 3,
      marginBottom: 22,
    },
    coverSummary: {
      fontSize: 11.5,
      textAlign: 'center',
      color: theme.colors.textBody,
      lineHeight: 1.55,
      marginLeft: 40,
      marginRight: 40,
      marginBottom: 30,
    },
    coverStatsRow: {
      flexDirection: 'row',
      gap: 0,
      justifyContent: 'center',
      marginBottom: 30,
    },
    coverStatCell: {
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      minWidth: 130,
    },
    coverStatValue: {
      fontSize: 30,
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.primary,
      marginBottom: 6,
    },
    coverStatLabel: {
      fontSize: 8.5,
      letterSpacing: 2.5,
      color: theme.colors.textMuted,
      fontFamily: 'Rubik',
      fontWeight: 700,
    },
    coverHighlightWrap: {
      alignItems: 'center',
      marginTop: 2,
    },
    coverHighlightLabel: { fontSize: 11, color: theme.colors.textBody },
    coverHighlightValue: { fontSize: 11, color: theme.colors.primary, fontFamily: 'Rubik', fontWeight: 700 },
    coverBottomRule: {
      width: 100,
      height: 1,
      backgroundColor: theme.colors.primary,
      alignSelf: 'center',
      marginTop: 28,
    },
    coverBottomPad: { flexGrow: 1 },

    // ── Section header (proposal-style) ──────────────────────────
    sectionHeaderWrap: { marginBottom: 18 },
    sectionTitle: {
      fontSize: 24,
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.textDark,
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    sectionRuleRow: {
      flexDirection: 'row',
      height: 1,
      marginBottom: 14,
    },
    sectionRulePrimary: {
      width: 80,
      backgroundColor: theme.colors.primary,
    },
    sectionRuleRest: {
      flex: 1,
      backgroundColor: theme.colors.border,
    },
    sectionIntro: {
      fontSize: 10.5,
      color: theme.colors.textBody,
      lineHeight: 1.55,
      marginBottom: 14,
    },

    // ── Legend ────────────────────────────────────────────────────
    legendHeading: {
      fontSize: 16,
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.textDark,
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    legendRule: {
      height: 1,
      backgroundColor: theme.colors.primary,
      width: 60,
      marginBottom: 14,
    },
    legendIntro: {
      fontSize: 10.5,
      color: theme.colors.textBody,
      marginBottom: 18,
      lineHeight: 1.55,
    },
    legendRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    legendRowLast: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    legendLabelCell: {
      width: 180,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 10,
      fontFamily: 'Rubik',
      fontWeight: 700,
      letterSpacing: 1.2,
    },
    legendDescCell: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 10,
      color: theme.colors.textBody,
      lineHeight: 1.45,
    },
    legendFootnote: {
      fontSize: 10,
      color: theme.colors.textBody,
      marginTop: 18,
      lineHeight: 1.55,
      fontFamily: 'Roboto',
      fontStyle: 'italic',
    },

    // ── Series header ────────────────────────────────────────────
    seriesHeaderWrap: { marginBottom: 18, marginTop: 8 },
    seriesLabel: {
      fontSize: 9,
      letterSpacing: 3.5,
      color: theme.colors.textMuted,
      fontFamily: 'Rubik',
      fontWeight: 700,
      marginBottom: 6,
    },
    seriesTitle: {
      fontSize: 22,
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.textDark,
      letterSpacing: 0.5,
      marginBottom: 6,
      lineHeight: 1.2,
    },
    seriesSubtitle: {
      fontSize: 11,
      color: theme.colors.textBody,
      marginBottom: 12,
    },
    seriesSplitRule: {
      flexDirection: 'row',
      height: 1,
      marginBottom: 16,
    },
    seriesSplitPrimary: { width: 80, backgroundColor: theme.colors.primary },
    seriesSplitRest: { flex: 1, backgroundColor: theme.colors.border },
    seriesStatsStrip: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 48,
      paddingVertical: 14,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.offwhite,
      marginBottom: 16,
    },
    seriesStatCell: { alignItems: 'center' },
    seriesStatValue: {
      fontSize: 18,
      fontFamily: 'Rubik',
      fontWeight: 700,
      color: theme.colors.textDark,
      letterSpacing: 0.5,
    },
    seriesStatLabel: {
      fontSize: 8,
      letterSpacing: 2.5,
      color: theme.colors.textMuted,
      fontFamily: 'Rubik',
      fontWeight: 700,
      marginTop: 4,
    },

    // ── Topic card ───────────────────────────────────────────────
    topicCard: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 16,
      paddingHorizontal: 2,
      marginBottom: -1, // collapse borders between adjacent cards
    },
    topicAccent: {
      width: 3,
      backgroundColor: theme.colors.primary,
      marginRight: 14,
    },
    topicAccentInvisible: {
      width: 3,
      backgroundColor: 'transparent',
      marginRight: 14,
    },
    topicBody: { flex: 1 },
    topicHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    topicTitleRow: { flexDirection: 'row', flex: 1, alignItems: 'flex-start' },
    topicNumber: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginRight: 8,
      fontFamily: 'Rubik',
      fontWeight: 700,
      letterSpacing: 0.5,
    },
    topicTitle: {
      fontSize: 13.5,
      color: theme.colors.textDark,
      fontFamily: 'Rubik',
      fontWeight: 700,
      flex: 1,
      letterSpacing: 0.3,
      lineHeight: 1.3,
    },
    topicTags: { alignItems: 'flex-end', marginLeft: 12 },
    topicTagPrimary: {
      fontSize: 8.5,
      letterSpacing: 1.5,
      color: theme.colors.primary,
      fontFamily: 'Rubik',
      fontWeight: 700,
    },
    topicTagWarning: {
      fontSize: 8.5,
      letterSpacing: 1.5,
      color: '#B06A13',
      fontFamily: 'Rubik',
      fontWeight: 700,
      marginTop: 3,
    },

    topicSourceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    topicSourceLabel: {
      fontSize: 7.5,
      letterSpacing: 1.8,
      color: theme.colors.textMuted,
      fontFamily: 'Rubik',
      fontWeight: 700,
      marginRight: 8,
    },
    topicSource: {
      fontSize: 10,
      color: theme.colors.textBody,
      flex: 1,
    },

    metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    metricTile: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
    },
    metricValue: {
      fontSize: 18,
      fontFamily: 'Rubik',
      fontWeight: 700,
      marginBottom: 3,
      letterSpacing: 0.5,
    },
    metricLabel: {
      fontSize: 7.5,
      letterSpacing: 1.8,
      fontFamily: 'Rubik',
      fontWeight: 700,
    },

    whyRow: { flexDirection: 'row', alignItems: 'flex-start' },
    whyLabel: {
      fontSize: 8.5,
      letterSpacing: 1.8,
      color: theme.colors.primary,
      fontFamily: 'Rubik',
      fontWeight: 700,
      marginRight: 10,
      marginTop: 2,
    },
    whyBody: {
      fontSize: 10.5,
      color: theme.colors.textBody,
      flex: 1,
      lineHeight: 1.5,
    },
  });
}

// ─── Sub-components ──────────────────────────────────────────────

function RunningHeader({
  agencyName,
  docTitle,
  styles,
}: {
  agencyName: string;
  docTitle?: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.runningHeader} fixed>
      <Text style={styles.runningHeaderStrong}>
        {agencyName.toUpperCase()}
        {docTitle ? (
          <Text style={styles.runningHeaderText}>{'  |  ' + docTitle.toUpperCase()}</Text>
        ) : null}
      </Text>
    </View>
  );
}

function Footer({
  agencyName,
  styles,
}: {
  agencyName: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerRule} />
      <View style={styles.footerInner}>
        <Text style={styles.footerText}>{agencyName}</Text>
        <Text style={styles.footerSep}>|</Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </View>
  );
}

function SplitRule({
  variant,
  styles,
}: {
  variant: 'series' | 'section';
  styles: ReturnType<typeof buildStyles>;
}) {
  if (variant === 'section') {
    return (
      <View style={styles.sectionRuleRow}>
        <View style={styles.sectionRulePrimary} />
        <View style={styles.sectionRuleRest} />
      </View>
    );
  }
  return (
    <View style={styles.seriesSplitRule}>
      <View style={styles.seriesSplitPrimary} />
      <View style={styles.seriesSplitRest} />
    </View>
  );
}

function StatRow({
  stats,
  styles,
}: {
  stats: BrandedDeliverableStat[];
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.coverStatsRow}>
      {stats.map((stat, i) => (
        <View key={`${stat.label}-${i}`} style={styles.coverStatCell}>
          <Text style={styles.coverStatValue}>{stat.value}</Text>
          <Text style={styles.coverStatLabel}>{stat.label.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

function TopicCard({
  topic,
  theme,
  styles,
}: {
  topic: BrandedDeliverableTopic;
  theme: AgencyTheme;
  styles: ReturnType<typeof buildStyles>;
}) {
  const isPriority = Boolean(topic.priorityLabel);
  return (
    <View style={styles.topicCard} wrap={false}>
      <View style={isPriority ? styles.topicAccent : styles.topicAccentInvisible} />
      <View style={styles.topicBody}>
        <View style={styles.topicHeaderRow}>
          <View style={styles.topicTitleRow}>
            <Text style={styles.topicNumber}>{topic.number}</Text>
            <Text style={styles.topicTitle}>{topic.title}</Text>
          </View>
          <View style={styles.topicTags}>
            {topic.resonanceLabel && <Text style={styles.topicTagPrimary}>{topic.resonanceLabel.toUpperCase()}</Text>}
            {topic.priorityLabel && <Text style={styles.topicTagWarning}>{topic.priorityLabel.toUpperCase()}</Text>}
          </View>
        </View>

        {topic.source && (
          <View style={styles.topicSourceRow}>
            <Text style={styles.topicSourceLabel}>{(topic.sourceLabel ?? 'SOURCE').toUpperCase()}</Text>
            <Text style={styles.topicSource}>{topic.source}</Text>
          </View>
        )}

        {topic.metrics.length > 0 && (
          <View style={styles.metricsRow}>
            {topic.metrics.map((metric, i) => {
              const tone = toneTileStyles(theme, metric.tone);
              return (
                <View
                  key={`${metric.label}-${i}`}
                  style={[styles.metricTile, { backgroundColor: tone.bg }]}
                >
                  <Text style={[styles.metricValue, { color: tone.text }]}>{metric.value}</Text>
                  <Text style={[styles.metricLabel, { color: tone.text }]}>{metric.label.toUpperCase()}</Text>
                </View>
              );
            })}
          </View>
        )}

        {topic.whyItWorks && (
          <View style={styles.whyRow}>
            <Text style={styles.whyLabel}>WHY IT WORKS</Text>
            <Text style={styles.whyBody}>{topic.whyItWorks}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Series({
  series,
  theme,
  styles,
}: {
  series: BrandedDeliverableSeries;
  theme: AgencyTheme;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View>
      <View style={styles.seriesHeaderWrap} wrap={false}>
        <Text style={styles.seriesLabel}>{series.label.toUpperCase()}</Text>
        <Text style={styles.seriesTitle}>{series.title}</Text>
        {series.subtitle && <Text style={styles.seriesSubtitle}>{series.subtitle}</Text>}
        <SplitRule variant="series" styles={styles} />
        {series.stats && series.stats.length > 0 && (
          <View style={styles.seriesStatsStrip}>
            {series.stats.map((stat, i) => (
              <View key={`${stat.label}-${i}`} style={styles.seriesStatCell}>
                <Text style={styles.seriesStatValue}>{stat.value}</Text>
                <Text style={styles.seriesStatLabel}>{stat.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {series.topics.map((topic) => (
        <TopicCard key={topic.number + topic.title} topic={topic} theme={theme} styles={styles} />
      ))}
    </View>
  );
}

function LegendSection({
  legend,
  theme,
  styles,
}: {
  legend: NonNullable<BrandedDeliverableData['legend']>;
  theme: AgencyTheme;
  styles: ReturnType<typeof buildStyles>;
}) {
  function toneColors(tone: BrandedDeliverableLegendItem['tone']) {
    switch (tone) {
      case 'positive': return { label: '#1F8A4C' };
      case 'warning': return { label: '#B06A13' };
      case 'negative': return { label: '#B43E3E' };
      case 'primary': return { label: theme.colors.primary };
      default: return { label: theme.colors.textDark };
    }
  }

  const items = legend.items ?? [];
  return (
    <View>
      {legend.heading && <Text style={styles.legendHeading}>{legend.heading.toUpperCase()}</Text>}
      <View style={styles.legendRule} />
      {legend.intro && <Text style={styles.legendIntro}>{legend.intro}</Text>}
      {items.length > 0 && (
        <View>
          {items.map((item, i) => {
            const colors = toneColors(item.tone);
            const isLast = i === items.length - 1;
            return (
              <View
                key={`${item.label}-${i}`}
                style={[styles.legendRow, isLast ? styles.legendRowLast : {}]}
              >
                <Text style={[styles.legendLabelCell, { color: colors.label }]}>
                  {item.label.toUpperCase()}
                </Text>
                <Text style={styles.legendDescCell}>{item.description}</Text>
              </View>
            );
          })}
        </View>
      )}
      {legend.footnote && <Text style={styles.legendFootnote}>{legend.footnote}</Text>}
    </View>
  );
}

// ─── Main document ────────────────────────────────────────────────

export function BrandedDeliverableDocument({
  data,
  theme,
}: {
  data: BrandedDeliverableData;
  theme: AgencyTheme;
}) {
  ensureFontsRegistered();
  const styles = buildStyles(theme);
  const agencyName = theme.name;
  const docTitle = data.runningHeaderTitle ?? data.eyebrow ?? data.title;

  const logoBuffer = readLogoBuffer(theme.logos.png);

  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverTopPad} />
        {logoBuffer && (
          <View style={styles.coverLogoWrap}>
            <Image src={logoBuffer} style={styles.coverLogo} />
          </View>
        )}
        <View style={styles.coverRuleWrap}>
          <View style={styles.coverRule} />
        </View>
        {data.kicker && <Text style={styles.coverKicker}>{data.kicker.toUpperCase()}</Text>}
        <Text style={styles.coverTitleAccent}>{data.title}</Text>
        {data.eyebrow && <Text style={styles.coverSubtitle}>{data.eyebrow.toUpperCase()}</Text>}
        {data.summary && <Text style={styles.coverSummary}>{data.summary}</Text>}
        {data.stats && data.stats.length > 0 && <StatRow stats={data.stats} styles={styles} />}
        {data.highlight && (
          <View style={styles.coverHighlightWrap}>
            <Text>
              <Text style={styles.coverHighlightLabel}>{data.highlight.label}: </Text>
              <Text style={styles.coverHighlightValue}>{data.highlight.value}</Text>
            </Text>
          </View>
        )}
        <View style={styles.coverBottomRule} />
        <View style={styles.coverBottomPad} />
        <Footer agencyName={agencyName} styles={styles} />
      </Page>

      {/* Legend */}
      {data.legend && (
        <Page size="A4" style={styles.page}>
          <RunningHeader agencyName={agencyName} docTitle={docTitle} styles={styles} />
          <LegendSection legend={data.legend} theme={theme} styles={styles} />
          <Footer agencyName={agencyName} styles={styles} />
        </Page>
      )}

      {/* Body */}
      <Page size="A4" style={styles.page}>
        <RunningHeader agencyName={agencyName} docTitle={docTitle} styles={styles} />
        {data.series.map((series, i) => (
          <Series key={series.label + i} series={series} theme={theme} styles={styles} />
        ))}
        <Footer agencyName={agencyName} styles={styles} />
      </Page>
    </Document>
  );
}
