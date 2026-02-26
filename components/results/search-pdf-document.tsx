import { Document, Page, Text, View, StyleSheet, Link, Image } from '@react-pdf/renderer';
import type { TopicSearch, TopicSearchAIResponse, TrendingTopic } from '@/lib/types/search';
import { NATIVZ_LOGO_PNG, AC_LOGO_PNG } from '@/lib/brand-logo';
import { isNewMetrics } from '@/lib/types/search';

const colors = {
  primary: '#046BD2',
  purple: '#8B5CF6',
  dark: '#0A0A0F',
  surface: '#141419',
  text: '#EAEAF0',
  muted: '#8A8A9A',
  border: '#2A2A35',
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
};

const styles = StyleSheet.create({
  page: { padding: 40, backgroundColor: '#FFFFFF', fontFamily: 'Helvetica', fontSize: 10 },
  header: { marginBottom: 24, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 16 },
  brandBar: { backgroundColor: colors.primary, height: 4, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: colors.dark, marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  meta: { fontSize: 9, color: '#999' },
  section: { marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.dark, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  body: { fontSize: 10, color: '#374151', lineHeight: 1.6 },
  card: { backgroundColor: '#F9FAFB', borderRadius: 6, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricBox: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 6, padding: 10, alignItems: 'center' as const },
  metricValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: colors.primary },
  metricLabel: { fontSize: 8, color: '#6B7280', marginTop: 2 },
  topicRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  topicName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1F2937', flex: 1 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  sentimentPositive: { backgroundColor: '#D1FAE5', color: '#065F46' },
  sentimentNegative: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  sentimentNeutral: { backgroundColor: '#FEF3C7', color: '#92400E' },
  sourceLink: { fontSize: 9, color: colors.primary, marginBottom: 3 },
  footer: { position: 'absolute' as const, bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText: { fontSize: 8, color: '#9CA3AF' },
  recommendation: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 4 },
  recText: { flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.5 },
});

function SentimentBadge({ sentiment }: { sentiment: number }) {
  const isPos = sentiment > 0.15;
  const isNeg = sentiment < -0.15;
  const label = isPos ? 'Positive' : isNeg ? 'Negative' : 'Neutral';
  const style = isPos ? styles.sentimentPositive : isNeg ? styles.sentimentNegative : styles.sentimentNeutral;
  return <Text style={[styles.badge, style]}>{label} ({(sentiment * 100).toFixed(0)}%)</Text>;
}

interface SearchPdfDocumentProps {
  search: TopicSearch;
  clientName?: string;
  agency?: string | null;
}

export function SearchPdfDocument({ search, clientName, agency }: SearchPdfDocumentProps) {
  const isAC = agency?.toLowerCase().includes('anderson') || agency?.toLowerCase() === 'ac';
  const logo = isAC ? AC_LOGO_PNG : NATIVZ_LOGO_PNG;
  const brandColor = isAC ? '#10B981' : colors.primary;
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;
  const topics = (search.trending_topics || []) as TrendingTopic[];
  const dateStr = search.completed_at
    ? new Date(search.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={[styles.brandBar, { backgroundColor: brandColor }]} />
        <View style={styles.header}>
          <Image src={logo} style={{ width: 120, height: 30, marginBottom: 10, objectFit: 'contain' }} />
          <Text style={styles.title}>{search.query}</Text>
          <Text style={styles.subtitle}>
            {clientName ? `Prepared for ${clientName}` : 'Research Report'}
          </Text>
          <Text style={styles.meta}>{dateStr} · Powered by Nativz Cortex</Text>
        </View>

        {/* Executive Summary */}
        {search.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{search.summary}</Text>
              {aiResponse?.overall_sentiment !== undefined && (
                <View style={{ marginTop: 8 }}>
                  <SentimentBadge sentiment={aiResponse.overall_sentiment} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Metrics */}
        {search.metrics && isNewMetrics(search.metrics) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{search.metrics.topic_score}</Text>
                <Text style={styles.metricLabel}>Topic Score</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{search.metrics.sources_analyzed}</Text>
                <Text style={styles.metricLabel}>Sources</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{search.metrics.content_opportunities}</Text>
                <Text style={styles.metricLabel}>Video Ideas</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{search.metrics.trending_topics_count}</Text>
                <Text style={styles.metricLabel}>Trending Angles</Text>
              </View>
            </View>
          </View>
        )}

        {/* Trending Topics */}
        {topics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trending Topics</Text>
            {topics.slice(0, 8).map((topic, i) => (
              <View key={i} style={styles.topicRow}>
                <Text style={styles.topicName}>{topic.name}</Text>
                <Text style={[styles.badge, { backgroundColor: '#EEF2FF', color: '#4338CA' }]}>
                  {topic.resonance}
                </Text>
                <View style={{ marginLeft: 6 }}>
                  <SentimentBadge sentiment={topic.sentiment} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Brand Alignment */}
        {aiResponse?.brand_alignment_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Brand Alignment</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{aiResponse.brand_alignment_notes}</Text>
            </View>
          </View>
        )}

        {/* Content Pillars */}
        {aiResponse?.content_pillars && aiResponse.content_pillars.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Content Pillars</Text>
            {aiResponse.content_pillars.map((pillar, i) => (
              <View key={i} style={styles.card}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 3 }}>{pillar.pillar}</Text>
                <Text style={styles.body}>{pillar.description}</Text>
                <Text style={{ fontSize: 9, color: '#6B7280', marginTop: 3 }}>
                  Example: {pillar.example_series} · {pillar.frequency}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Recommendations */}
        {topics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {topics.filter(t => t.resonance === 'viral' || t.resonance === 'high').slice(0, 3).map((t, i) => (
              <View key={i} style={styles.recommendation}>
                <View style={styles.recDot} />
                <Text style={styles.recText}>
                  Create content around &ldquo;{t.name}&rdquo; — {t.resonance} resonance detected with {t.video_ideas?.length || 0} video ideas ready.
                </Text>
              </View>
            ))}
            {aiResponse?.niche_performance_insights?.competitor_gaps && (
              <View style={styles.recommendation}>
                <View style={[styles.recDot, { backgroundColor: colors.amber }]} />
                <Text style={styles.recText}>
                  Competitor gap: {aiResponse.niche_performance_insights.competitor_gaps}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Sources */}
        {search.serp_data && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sources ({search.serp_data.webResults.length + search.serp_data.videos.length})</Text>
            {search.serp_data.webResults.slice(0, 10).map((r: { url: string; title: string }, i: number) => (
              <Link key={i} src={r.url} style={styles.sourceLink}>
                {r.title}
              </Link>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{isAC ? 'Anderson Collaborative' : 'Nativz'} Cortex · Research Report</Text>
          <Text style={styles.footerText}>{dateStr}</Text>
        </View>
      </Page>
    </Document>
  );
}
