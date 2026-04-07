import { Document, Page, Text, View, StyleSheet, Link, Image } from '@react-pdf/renderer';
import type {
  TopicSearch,
  TopicSearchAIResponse,
  TrendingTopic,
  EmotionBreakdown,
  ContentBreakdownItem,
  VideoIdea,
} from '@/lib/types/search';
import { NATIVZ_LOGO_ON_LIGHT_PNG, AC_LOGO_PNG } from '@/lib/brand-logo';
import { isNewMetrics } from '@/lib/types/search';

// ─── Dark mode color palette ──────────────────────────────────────────────────

const c = {
  bg: '#0F1117',
  surface: '#161921',
  surfaceHover: '#1C1F2B',
  text: '#EAEAF0',
  textSecondary: '#A8A8B8',
  muted: '#6A6A7A',
  border: '#2A2A38',
  borderLight: '#22222E',
  accent: '#046BD2',
  accentSoft: '#0A2A50',
  purple: '#8B5CF6',
  purpleSoft: '#2A1A50',
  green: '#10B981',
  greenSoft: '#0A2E22',
  red: '#EF4444',
  redSoft: '#2E0A0A',
  amber: '#F59E0B',
  amberSoft: '#2E2A0A',
  cyan: '#06B6D4',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 36, backgroundColor: c.bg, fontFamily: 'Helvetica', fontSize: 10, color: c.text },
  brandBar: { height: 3, marginBottom: 14 },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 14 },
  logoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: c.text, marginBottom: 4 },
  subtitle: { fontSize: 11, color: c.textSecondary, marginBottom: 2 },
  meta: { fontSize: 9, color: c.muted },

  section: { marginTop: 16, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.border },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.text },

  card: { backgroundColor: c.surface, borderRadius: 6, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: c.borderLight },
  body: { fontSize: 10, color: c.textSecondary, lineHeight: 1.6 },

  metricsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  metricBox: { flex: 1, backgroundColor: c.surface, borderRadius: 6, padding: 10, alignItems: 'center' as const, borderWidth: 1, borderColor: c.borderLight },
  metricValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: c.accent },
  metricLabel: { fontSize: 8, color: c.muted, marginTop: 2 },

  // Emotions
  emotionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  emotionLabel: { width: 70, fontSize: 9, color: c.textSecondary },
  emotionBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.surfaceHover },
  emotionBarFill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  emotionPct: { width: 30, textAlign: 'right' as const, fontSize: 9, color: c.textSecondary },

  // Content breakdown
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  breakdownLabel: { width: 90, fontSize: 9, color: c.textSecondary },
  breakdownBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceHover },
  breakdownBarFill: { height: 6, borderRadius: 3 },

  // Topics
  topicRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.borderLight },
  topicName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: c.text, flex: 1 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },

  // Video ideas
  videoIdea: { backgroundColor: c.surfaceHover, borderRadius: 4, padding: 8, marginBottom: 4, marginLeft: 12 },
  videoTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.text, marginBottom: 2 },
  videoDetail: { fontSize: 8, color: c.muted, marginBottom: 1 },

  // Niche insights
  insightGrid: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' as const },
  insightBox: { width: '48%', backgroundColor: c.surface, borderRadius: 6, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: c.borderLight },
  insightLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  insightItem: { fontSize: 9, color: c.textSecondary, marginBottom: 2 },

  // Recommendations
  recRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  recDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  recText: { flex: 1, fontSize: 9, color: c.textSecondary, lineHeight: 1.5 },
  recPriority: { fontSize: 7, fontFamily: 'Helvetica-Bold', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, textTransform: 'uppercase' as const },

  // Key findings
  findingCard: { backgroundColor: c.surface, borderRadius: 6, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: c.borderLight, borderLeftWidth: 3, borderLeftColor: c.accent },
  findingText: { fontSize: 9, color: c.textSecondary, lineHeight: 1.5 },

  // Sources
  sourceLink: { fontSize: 9, color: c.accent, marginBottom: 3, textDecoration: 'none' as const },

  // Footer
  footer: { position: 'absolute' as const, bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: c.muted },

  // Pillars
  pillarCard: { backgroundColor: c.surface, borderRadius: 6, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: c.borderLight },
  pillarTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: c.text, marginBottom: 2 },
  pillarMeta: { fontSize: 8, color: c.muted, marginTop: 3 },
});

// ─── Helper components ────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: number }) {
  const isPos = sentiment > 0.15;
  const isNeg = sentiment < -0.15;
  const label = isPos ? 'Positive' : isNeg ? 'Negative' : 'Neutral';
  const bg = isPos ? c.greenSoft : isNeg ? c.redSoft : c.amberSoft;
  const color = isPos ? c.green : isNeg ? c.red : c.amber;
  return <Text style={[s.badge, { backgroundColor: bg, color }]}>{label} ({(sentiment * 100).toFixed(0)}%)</Text>;
}

function ResonanceBadge({ resonance }: { resonance: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    viral: { bg: c.purpleSoft, fg: c.purple },
    high: { bg: c.greenSoft, fg: c.green },
    medium: { bg: c.accentSoft, fg: c.accent },
    low: { bg: c.surfaceHover, fg: c.muted },
  };
  const { bg, fg } = colorMap[resonance] ?? colorMap.low;
  return <Text style={[s.badge, { backgroundColor: bg, color: fg }]}>{resonance}</Text>;
}

function SectionHeader({ title, dotColor }: { title: string; dotColor?: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionDot, { backgroundColor: dotColor || c.accent }]} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

/** Renders **Markdown bold** in PDF using nested Text (Helvetica-Bold). */
function PdfTextWithBold({ text, style }: { text: string; style: typeof s.body }) {
  const segments = text.split(/(\*\*.+?\*\*)/g);
  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        const m = seg.match(/^\*\*(.+?)\*\*$/);
        if (m) {
          return (
            <Text key={i} style={{ fontFamily: 'Helvetica-Bold', color: c.text }}>
              {m[1]}
            </Text>
          );
        }
        return <Text key={i}>{seg}</Text>;
      })}
    </Text>
  );
}

// ─── Main document ────────────────────────────────────────────────────────────

interface SearchPdfDocumentProps {
  search: TopicSearch;
  clientName?: string;
  agency?: string | null;
}

export function SearchPdfDocument({ search, clientName, agency }: SearchPdfDocumentProps) {
  const isAC = agency?.toLowerCase().includes('anderson') || agency?.toLowerCase() === 'ac';
  const logo = isAC ? AC_LOGO_PNG : NATIVZ_LOGO_ON_LIGHT_PNG;
  const brandColor = isAC ? c.green : c.accent;
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;
  const topics = (search.trending_topics ?? []) as TrendingTopic[];
  const emotions = (search.emotions ?? []) as EmotionBreakdown[];
  const hasBrandAlignment = !!aiResponse?.brand_alignment_notes;
  const dateStr = search.completed_at
    ? new Date(search.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Extract key findings from summary (strip Markdown bold markers first)
  const keyFindings = (search.summary ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 4);

  // Build action items
  const actions: { text: string; priority: 'high' | 'medium' | 'low'; color: string }[] = [];
  const viralTopics = topics.filter((t) => t.resonance === 'viral' || t.resonance === 'high');
  if (viralTopics.length > 0) {
    actions.push({ text: `Create content around "${viralTopics[0].name}" — ${viralTopics[0].resonance} resonance detected`, priority: 'high', color: c.amber });
  }
  const allVideoIdeas = topics.flatMap((t) => t.video_ideas ?? []);
  const viralIdeas = allVideoIdeas.filter((v: VideoIdea) => v.virality === 'viral_potential' || v.virality === 'high');
  if (viralIdeas.length > 0) {
    actions.push({ text: `Produce "${viralIdeas[0].title}" (${viralIdeas[0].format}) — high virality potential`, priority: 'high', color: c.purple });
  }
  if (aiResponse?.content_pillars && aiResponse.content_pillars.length > 0) {
    actions.push({ text: `Focus on ${aiResponse.content_pillars.length} content pillars: ${aiResponse.content_pillars.slice(0, 2).map((p) => p.pillar).join(', ')}`, priority: 'medium', color: c.accent });
  }
  if (aiResponse?.niche_performance_insights?.competitor_gaps) {
    actions.push({ text: `Competitor gap: ${aiResponse.niche_performance_insights.competitor_gaps}`, priority: 'medium', color: c.cyan });
  }
  if (topics.length > 3) {
    actions.push({ text: `${topics.length} trending angles found — batch-plan content for the top 3–5 this week`, priority: 'low', color: c.muted });
  }

  return (
    <Document>
      {/* ── Page 1: Summary, Metrics, Findings ─────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={[s.brandBar, { backgroundColor: brandColor }]} />
        <View style={s.header}>
          <View style={s.logoRow}>
            <View>
              <Text style={s.title}>{search.query}</Text>
              <Text style={s.subtitle}>
                {clientName ? `Prepared for ${clientName}` : 'Research report'}
              </Text>
              <Text style={s.meta}>{dateStr} · Powered by {isAC ? 'Anderson Collaborative' : 'Nativz'} Cortex</Text>
            </View>
            <Image src={logo} style={{ width: 80, height: 20 }} />
          </View>
        </View>

        {/* Executive summary — always when present; brand alignment is additional */}
        {search.summary ? (
          <View style={s.section}>
            <SectionHeader title="Executive summary" dotColor={c.accent} />
            <View style={s.card}>
              <PdfTextWithBold text={search.summary} style={s.body} />
              {aiResponse?.overall_sentiment !== undefined && !hasBrandAlignment ? (
                <View style={{ marginTop: 8 }}>
                  <SentimentBadge sentiment={aiResponse.overall_sentiment} />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        {hasBrandAlignment ? (
          <View style={s.section}>
            <SectionHeader title="Brand alignment" dotColor={c.purple} />
            <View style={s.card}>
              <PdfTextWithBold text={aiResponse!.brand_alignment_notes ?? ''} style={s.body} />
              {aiResponse?.overall_sentiment !== undefined ? (
                <View style={{ marginTop: 8 }}>
                  <SentimentBadge sentiment={aiResponse.overall_sentiment} />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Key Findings */}
        {keyFindings.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Key findings" dotColor={c.amber} />
            {keyFindings.map((finding, i) => (
              <View key={i} style={s.findingCard}>
                <Text style={s.findingText}>{finding}.</Text>
              </View>
            ))}
          </View>
        )}

        {/* Metrics */}
        {search.metrics && isNewMetrics(search.metrics) && (
          <View style={s.section}>
            <SectionHeader title="Key metrics" />
            <View style={s.metricsRow}>
              {hasBrandAlignment ? (
                <>
                  <View style={s.metricBox}>
                    <Text style={[s.metricValue, { color: c.purple }]}>{search.metrics.sources_analyzed}</Text>
                    <Text style={s.metricLabel}>Brand references</Text>
                  </View>
                  <View style={s.metricBox}>
                    <Text style={s.metricValue}>{search.metrics.sources_analyzed}</Text>
                    <Text style={s.metricLabel}>Sources analyzed</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={s.metricBox}>
                    <Text style={s.metricValue}>{search.metrics.topic_score}</Text>
                    <Text style={s.metricLabel}>Topic score</Text>
                  </View>
                  <View style={s.metricBox}>
                    <Text style={s.metricValue}>{search.metrics.sources_analyzed}</Text>
                    <Text style={s.metricLabel}>Sources</Text>
                  </View>
                </>
              )}
              <View style={s.metricBox}>
                <Text style={[s.metricValue, { color: c.green }]}>{search.metrics.content_opportunities}</Text>
                <Text style={s.metricLabel}>Video ideas</Text>
              </View>
              <View style={s.metricBox}>
                <Text style={[s.metricValue, { color: c.purple }]}>{search.metrics.trending_topics_count}</Text>
                <Text style={s.metricLabel}>Trending angles</Text>
              </View>
            </View>
          </View>
        )}

        {/* Emotions Breakdown */}
        {emotions.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Emotions" dotColor={c.purple} />
            <View style={s.card}>
              {emotions.map((e, i) => (
                <View key={i} style={s.emotionRow}>
                  <Text style={s.emotionLabel}>{e.emotion}</Text>
                  <View style={s.emotionBarBg}>
                    <View style={[s.emotionBarFill, { width: `${e.percentage}%`, backgroundColor: e.color || c.accent }]} />
                  </View>
                  <Text style={s.emotionPct}>{e.percentage}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Content Breakdown */}
        {search.content_breakdown && (
          <View style={s.section}>
            <SectionHeader title="Content breakdown" dotColor={c.cyan} />
            {search.content_breakdown.intentions && search.content_breakdown.intentions.length > 0 && (
              <View style={s.card}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.muted, marginBottom: 6, textTransform: 'uppercase' as const }}>
                  Intentions
                </Text>
                {search.content_breakdown.intentions.map((item: ContentBreakdownItem, i: number) => (
                  <View key={i} style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>{item.name}</Text>
                    <View style={s.breakdownBarBg}>
                      <View style={[s.breakdownBarFill, { width: `${item.percentage}%`, backgroundColor: c.accent }]} />
                    </View>
                    <Text style={{ width: 30, textAlign: 'right' as const, fontSize: 8, color: c.muted }}>{item.percentage}%</Text>
                  </View>
                ))}
              </View>
            )}
            {search.content_breakdown.categories && search.content_breakdown.categories.length > 0 && (
              <View style={s.card}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.muted, marginBottom: 6, textTransform: 'uppercase' as const }}>
                  Categories
                </Text>
                {search.content_breakdown.categories.map((item: ContentBreakdownItem, i: number) => (
                  <View key={i} style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>{item.name}</Text>
                    <View style={s.breakdownBarBg}>
                      <View style={[s.breakdownBarFill, { width: `${item.percentage}%`, backgroundColor: c.purple }]} />
                    </View>
                    <Text style={{ width: 30, textAlign: 'right' as const, fontSize: 8, color: c.muted }}>{item.percentage}%</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>{isAC ? 'Anderson Collaborative' : 'Nativz'} Cortex · Research report</Text>
          <Text style={s.footerText}>{dateStr}</Text>
        </View>
      </Page>

      {/* ── Page 2: Trending Topics with Video Ideas ───────────────────────── */}
      {topics.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionHeader title={`Trending topics (${topics.length})`} dotColor={c.green} />
            {topics.map((topic, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 8 }}>
                <View style={s.topicRow}>
                  <Text style={s.topicName}>{topic.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <ResonanceBadge resonance={topic.resonance} />
                    <SentimentBadge sentiment={topic.sentiment} />
                  </View>
                </View>

                {/* Posts & comments overview */}
                {(topic.posts_overview || topic.comments_overview) && (
                  <View style={{ paddingLeft: 12, paddingTop: 3, paddingBottom: 2 }}>
                    {topic.posts_overview && (
                      <Text style={{ fontSize: 8, color: c.muted, marginBottom: 1 }}>{topic.posts_overview}</Text>
                    )}
                    {topic.comments_overview && (
                      <Text style={{ fontSize: 8, color: c.muted }}>{topic.comments_overview}</Text>
                    )}
                  </View>
                )}

                {/* Video ideas for this topic */}
                {topic.video_ideas && topic.video_ideas.length > 0 && (
                  <View style={{ marginTop: 3 }}>
                    {topic.video_ideas.slice(0, 3).map((idea: VideoIdea, j: number) => (
                      <View key={j} style={s.videoIdea}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={s.videoTitle}>{idea.title}</Text>
                          <Text style={[s.badge, {
                            backgroundColor: idea.virality === 'viral_potential' ? c.purpleSoft : idea.virality === 'high' ? c.greenSoft : c.surfaceHover,
                            color: idea.virality === 'viral_potential' ? c.purple : idea.virality === 'high' ? c.green : c.muted,
                            fontSize: 7,
                          }]}>
                            {idea.virality === 'viral_potential' ? 'viral' : idea.virality}
                          </Text>
                        </View>
                        <Text style={s.videoDetail}>Hook: {idea.hook}</Text>
                        <Text style={s.videoDetail}>Format: {idea.format}</Text>
                        <Text style={s.videoDetail}>Why: {idea.why_it_works}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          <View style={s.footer} fixed>
            <Text style={s.footerText}>{isAC ? 'Anderson Collaborative' : 'Nativz'} Cortex · Research report</Text>
            <Text style={s.footerText}>{dateStr}</Text>
          </View>
        </Page>
      )}

      {/* ── Page 3: Pillars, Niche Insights, Actions, Sources ──────────────── */}
      <Page size="A4" style={s.page}>
        {/* Content Pillars */}
        {aiResponse?.content_pillars && aiResponse.content_pillars.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Content pillars" dotColor={c.accent} />
            {aiResponse.content_pillars.map((pillar, i) => (
              <View key={i} style={s.pillarCard} wrap={false}>
                <Text style={s.pillarTitle}>{pillar.pillar}</Text>
                <Text style={s.body}>{pillar.description}</Text>
                <Text style={s.pillarMeta}>
                  Example: {pillar.example_series} · {pillar.frequency}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Niche Insights */}
        {aiResponse?.niche_performance_insights && (
          <View style={s.section}>
            <SectionHeader title="Niche insights" dotColor={c.amber} />
            <View style={s.insightGrid}>
              {aiResponse.niche_performance_insights.top_performing_formats?.length > 0 && (
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>Top formats</Text>
                  {aiResponse.niche_performance_insights.top_performing_formats.map((f, i) => (
                    <Text key={i} style={s.insightItem}>• {f}</Text>
                  ))}
                </View>
              )}
              {aiResponse.niche_performance_insights.audience_hooks?.length > 0 && (
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>Audience hooks</Text>
                  {aiResponse.niche_performance_insights.audience_hooks.map((h, i) => (
                    <Text key={i} style={s.insightItem}>• {h}</Text>
                  ))}
                </View>
              )}
              {aiResponse.niche_performance_insights.competitor_gaps && (
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>Competitor gaps</Text>
                  <Text style={s.insightItem}>{aiResponse.niche_performance_insights.competitor_gaps}</Text>
                </View>
              )}
              {aiResponse.niche_performance_insights.best_posting_times && (
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>Best posting times</Text>
                  <Text style={s.insightItem}>{aiResponse.niche_performance_insights.best_posting_times}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Big Movers */}
        {aiResponse?.big_movers && aiResponse.big_movers.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="Big movers" dotColor={c.amber} />
            {aiResponse.big_movers.map((mover: { name: string; type: string; why: string; tactics: string[]; takeaway: string }, i: number) => (
              <View key={i} style={s.card} wrap={false}>
                <Text style={{ fontSize: 10, fontWeight: 700, color: c.text, marginBottom: 2 }}>{mover.name} ({mover.type})</Text>
                <Text style={{ fontSize: 8, color: c.textSecondary, marginBottom: 4 }}>{mover.why}</Text>
                {mover.tactics.map((t: string, j: number) => (
                  <Text key={j} style={{ fontSize: 8, color: c.muted, marginBottom: 1, paddingLeft: 8 }}>• {t}</Text>
                ))}
                <Text style={{ fontSize: 8, color: c.accent, marginTop: 3 }}>{mover.takeaway}</Text>
              </View>
            ))}
          </View>
        ) : actions.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="Recommended actions" dotColor={c.green} />
            {actions.map((action, i) => (
              <View key={i} style={s.recRow} wrap={false}>
                <View style={[s.recDot, { backgroundColor: action.color }]} />
                <Text style={s.recText}>{action.text}</Text>
                <Text style={[s.recPriority, {
                  backgroundColor: action.priority === 'high' ? c.amberSoft : action.priority === 'medium' ? c.accentSoft : c.surfaceHover,
                  color: action.priority === 'high' ? c.amber : action.priority === 'medium' ? c.accent : c.muted,
                }]}>
                  {action.priority}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Sources */}
        {search.serp_data && (
          <View style={s.section}>
            <SectionHeader title={`Sources (${(search.serp_data.webResults?.length ?? 0) + (search.serp_data.videos?.length ?? 0)})`} dotColor={c.muted} />
            <View style={s.card}>
              {(search.serp_data.webResults ?? []).slice(0, 12).map((r: { url: string; title: string }, i: number) => (
                <Link key={i} src={r.url} style={s.sourceLink}>
                  {r.title}
                </Link>
              ))}
              {(search.serp_data.videos ?? []).length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.muted, marginBottom: 4 }}>
                    Videos
                  </Text>
                  {(search.serp_data.videos ?? []).slice(0, 6).map((v: { url: string; title: string }, i: number) => (
                    <Link key={i} src={v.url} style={s.sourceLink}>
                      {v.title}
                    </Link>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>{isAC ? 'Anderson Collaborative' : 'Nativz'} Cortex · Research report</Text>
          <Text style={s.footerText}>{dateStr}</Text>
        </View>
      </Page>
    </Document>
  );
}
