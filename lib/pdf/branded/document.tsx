import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { AgencyTheme } from '@/lib/branding';
import type {
  BrandedDeliverableData,
  BrandedDeliverableLegendItem,
  BrandedDeliverableMetric,
  BrandedDeliverableSeries,
  BrandedDeliverableStat,
  BrandedDeliverableTopic,
} from './types';

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

function toneTileStyles(theme: AgencyTheme, tone: BrandedDeliverableMetric['tone']) {
  switch (tone) {
    case 'positive':
      return { bg: '#E8F6EE', text: '#1F8A4C' };
    case 'negative':
      return { bg: '#FDF2DC', text: '#B06A13' };
    default:
      return { bg: '#F3F4F6', text: theme.colors.textDark };
  }
}

function buildStyles(theme: AgencyTheme) {
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingHorizontal: 48,
      paddingBottom: 72,
      fontFamily: 'Helvetica',
      fontSize: 10,
      color: theme.colors.textBody,
      backgroundColor: theme.colors.white,
    },

    // Running header (every non-cover page)
    runningHeader: {
      position: 'absolute',
      top: 24,
      left: 48,
      right: 48,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    runningHeaderText: {
      fontSize: 8,
      color: theme.colors.textMuted,
      letterSpacing: 1,
    },
    runningHeaderDivider: {
      marginHorizontal: 6,
      color: theme.colors.border,
    },

    // Footer
    footer: {
      position: 'absolute',
      bottom: 28,
      left: 48,
      right: 48,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerText: { fontSize: 8, color: theme.colors.textMuted, letterSpacing: 0.3 },
    footerDot: { fontSize: 8, color: theme.colors.textMuted, marginHorizontal: 6 },

    // ── Cover ─────────────────────────────────────────────────────
    coverPage: {
      padding: 64,
      fontFamily: 'Helvetica',
      fontSize: 10,
      color: theme.colors.textBody,
      backgroundColor: theme.colors.white,
      flexDirection: 'column',
      justifyContent: 'center',
    },
    coverLogoWrap: {
      alignItems: 'center',
      marginBottom: 40,
    },
    coverLogo: { height: 48, objectFit: 'contain' },
    coverEyebrow: {
      fontSize: 11,
      letterSpacing: 4,
      textAlign: 'center',
      fontFamily: 'Helvetica-Bold',
      color: theme.colors.textDark,
      marginBottom: 18,
    },
    coverKicker: {
      fontSize: 28,
      textAlign: 'center',
      fontFamily: 'Helvetica',
      color: theme.colors.textDark,
      marginBottom: 4,
    },
    coverTitle: {
      fontSize: 34,
      textAlign: 'center',
      fontFamily: 'Helvetica-Bold',
      color: theme.colors.primary,
      lineHeight: 1.15,
      marginBottom: 20,
    },
    coverSummary: {
      fontSize: 11.5,
      textAlign: 'center',
      color: theme.colors.textBody,
      lineHeight: 1.5,
      maxWidth: 460,
      marginHorizontal: 'auto',
      marginBottom: 32,
    },
    coverStatsRow: {
      flexDirection: 'row',
      gap: 24,
      justifyContent: 'center',
      marginBottom: 28,
    },
    coverStatCell: {
      alignItems: 'center',
      paddingHorizontal: 24,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 14,
      minWidth: 120,
    },
    coverStatValue: {
      fontSize: 26,
      fontFamily: 'Helvetica-Bold',
      color: theme.colors.primary,
      marginBottom: 4,
    },
    coverStatLabel: {
      fontSize: 8.5,
      letterSpacing: 2,
      color: theme.colors.textMuted,
      fontFamily: 'Helvetica-Bold',
    },
    coverHighlightWrap: {
      textAlign: 'center',
      marginTop: 8,
    },
    coverHighlightLabel: { fontSize: 11, color: theme.colors.textBody },
    coverHighlightValue: { fontSize: 11, color: theme.colors.primary, fontFamily: 'Helvetica-Bold' },

    // ── Legend page ───────────────────────────────────────────────
    legendHeading: {
      fontSize: 15,
      fontFamily: 'Helvetica-Bold',
      color: theme.colors.textDark,
      marginBottom: 6,
      letterSpacing: 0.6,
    },
    legendIntro: {
      fontSize: 10.5,
      color: theme.colors.textBody,
      marginBottom: 14,
      lineHeight: 1.45,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: 4,
      marginBottom: 6,
      overflow: 'hidden',
    },
    legendLabelCell: {
      width: 180,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
    },
    legendDescCell: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 10,
      color: theme.colors.textBody,
      backgroundColor: theme.colors.offwhite,
    },
    legendFootnote: {
      fontSize: 10,
      color: theme.colors.textBody,
      marginTop: 16,
      lineHeight: 1.45,
    },

    // ── Series header ────────────────────────────────────────────
    seriesHeader: {
      marginBottom: 14,
    },
    seriesLabel: {
      fontSize: 9,
      letterSpacing: 3,
      color: theme.colors.textMuted,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 4,
    },
    seriesTitle: {
      fontSize: 22,
      fontFamily: 'Helvetica-Bold',
      color: theme.colors.textDark,
      marginBottom: 4,
      lineHeight: 1.15,
    },
    seriesSubtitle: {
      fontSize: 11,
      color: theme.colors.textBody,
      marginBottom: 12,
    },
    seriesAccent: {
      height: 2,
      backgroundColor: theme.colors.primary,
      marginBottom: 12,
    },
    seriesStatsStrip: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: theme.colors.offwhite,
      paddingVertical: 10,
      borderRadius: 4,
      marginBottom: 16,
    },
    seriesStatCell: { alignItems: 'center' },
    seriesStatValue: {
      fontSize: 16,
      fontFamily: 'Helvetica-Bold',
      color: theme.colors.textDark,
    },
    seriesStatLabel: {
      fontSize: 8,
      letterSpacing: 2,
      color: theme.colors.textMuted,
      fontFamily: 'Helvetica-Bold',
      marginTop: 2,
    },

    // ── Topic card ───────────────────────────────────────────────
    topicCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      padding: 14,
      marginBottom: 12,
    },
    topicHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    topicNumber: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginRight: 6,
      fontFamily: 'Helvetica',
    },
    topicTitle: {
      fontSize: 13,
      color: theme.colors.textDark,
      fontFamily: 'Helvetica-Bold',
      flex: 1,
      flexWrap: 'wrap',
    },
    topicTags: { alignItems: 'flex-end', marginLeft: 8 },
    topicTagPrimary: {
      fontSize: 8.5,
      letterSpacing: 1.5,
      color: theme.colors.primary,
      fontFamily: 'Helvetica-Bold',
    },
    topicTagWarning: {
      fontSize: 8.5,
      letterSpacing: 1.5,
      color: '#B06A13',
      fontFamily: 'Helvetica-Bold',
      marginTop: 2,
    },

    topicSourceLabel: {
      fontSize: 7.5,
      letterSpacing: 1.5,
      color: theme.colors.textMuted,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 2,
    },
    topicSource: {
      fontSize: 10,
      color: theme.colors.textBody,
      marginBottom: 10,
    },

    metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    metricTile: {
      flex: 1,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    metricValue: {
      fontSize: 16,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 2,
    },
    metricLabel: {
      fontSize: 7.5,
      letterSpacing: 1.5,
      fontFamily: 'Helvetica-Bold',
    },

    whyRow: { flexDirection: 'row', alignItems: 'flex-start' },
    whyLabel: {
      fontSize: 8.5,
      letterSpacing: 1.5,
      color: theme.colors.primary,
      fontFamily: 'Helvetica-Bold',
      marginRight: 8,
      marginTop: 2,
    },
    whyBody: {
      fontSize: 10,
      color: theme.colors.textBody,
      flex: 1,
      lineHeight: 1.4,
    },
  });
}

// ─── Small render helpers ──────────────────────────────────────────

function RunningHeader({
  productName,
  title,
  styles,
}: {
  productName: string;
  title?: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.runningHeader} fixed>
      <Text style={styles.runningHeaderText}>
        {productName.toUpperCase()}
        {title ? `  |  ${title.toUpperCase()}` : ''}
      </Text>
    </View>
  );
}

function Footer({
  productName,
  title,
  styles,
}: {
  productName: string;
  title?: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{productName}</Text>
      <Text style={styles.footerDot}>·</Text>
      {title && (
        <>
          <Text style={styles.footerText}>{title}</Text>
          <Text style={styles.footerDot}>·</Text>
        </>
      )}
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
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
  return (
    <View style={styles.topicCard} wrap={false}>
      <View style={styles.topicHeader}>
        <View style={{ flexDirection: 'row', flex: 1, alignItems: 'flex-start' }}>
          <Text style={styles.topicNumber}>{topic.number}</Text>
          <Text style={styles.topicTitle}>{topic.title}</Text>
        </View>
        <View style={styles.topicTags}>
          {topic.resonanceLabel && <Text style={styles.topicTagPrimary}>{topic.resonanceLabel.toUpperCase()}</Text>}
          {topic.priorityLabel && <Text style={styles.topicTagWarning}>{topic.priorityLabel.toUpperCase()}</Text>}
        </View>
      </View>

      {topic.source && (
        <>
          <Text style={styles.topicSourceLabel}>{(topic.sourceLabel ?? 'SOURCE').toUpperCase()}</Text>
          <Text style={styles.topicSource}>{topic.source}</Text>
        </>
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
      <View style={styles.seriesHeader} wrap={false}>
        <Text style={styles.seriesLabel}>{series.label.toUpperCase()}</Text>
        <Text style={styles.seriesTitle}>{series.title}</Text>
        {series.subtitle && <Text style={styles.seriesSubtitle}>{series.subtitle}</Text>}
        <View style={styles.seriesAccent} />
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
      case 'positive': return { label: '#1F8A4C', bg: '#E8F6EE' };
      case 'warning': return { label: '#B06A13', bg: '#FDF2DC' };
      case 'negative': return { label: '#B43E3E', bg: '#FDE3E3' };
      case 'primary': return { label: theme.colors.primary, bg: theme.colors.primarySurface };
      default: return { label: theme.colors.textDark, bg: theme.colors.offwhite };
    }
  }

  return (
    <View>
      {legend.heading && <Text style={styles.legendHeading}>{legend.heading.toUpperCase()}</Text>}
      {legend.intro && <Text style={styles.legendIntro}>{legend.intro}</Text>}
      {legend.items && legend.items.length > 0 && (
        <View>
          {legend.items.map((item, i) => {
            const colors = toneColors(item.tone);
            return (
              <View key={`${item.label}-${i}`} style={styles.legendRow}>
                <Text
                  style={[styles.legendLabelCell, { color: colors.label, backgroundColor: withAlpha(colors.label, 0.08) }]}
                >
                  {item.label}
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
  const styles = buildStyles(theme);
  const productName = data.runningHeaderProduct ?? `${theme.name} Cortex`;
  const runningTitle = data.runningHeaderTitle ?? data.eyebrow ?? data.title;

  return (
    <Document>
      {/* Cover page */}
      <Page size="A4" style={styles.coverPage}>
        {theme.logos.pngBase64 && (
          <View style={styles.coverLogoWrap}>
            <Image src={theme.logos.pngBase64} style={styles.coverLogo} />
          </View>
        )}
        {data.eyebrow && <Text style={styles.coverEyebrow}>{data.eyebrow.toUpperCase()}</Text>}
        {data.kicker && <Text style={styles.coverKicker}>{data.kicker}</Text>}
        <Text style={styles.coverTitle}>{data.title}</Text>
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
        <Footer productName={productName} title={runningTitle} styles={styles} />
      </Page>

      {/* Legend page (optional) */}
      {data.legend && (
        <Page size="A4" style={styles.page}>
          <RunningHeader productName={productName} title={runningTitle} styles={styles} />
          <LegendSection legend={data.legend} theme={theme} styles={styles} />
          <Footer productName={productName} title={runningTitle} styles={styles} />
        </Page>
      )}

      {/* Body — series + topic cards */}
      <Page size="A4" style={styles.page}>
        <RunningHeader productName={productName} title={runningTitle} styles={styles} />
        {data.series.map((series, i) => (
          <Series key={series.label + i} series={series} theme={theme} styles={styles} />
        ))}
        <Footer productName={productName} title={runningTitle} styles={styles} />
      </Page>
    </Document>
  );
}
