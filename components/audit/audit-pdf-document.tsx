import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type {
  WebsiteContext,
  PlatformReport,
  CompetitorProfile,
  AuditScorecard,
  ScorecardItem,
  ScoreStatus,
} from '@/lib/audit/types';
import { NATIVZ_LOGO_ON_LIGHT_PNG, AC_LOGO_PNG } from '@/lib/brand-logo';

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
  green: '#10B981',
  greenSoft: '#0A2E22',
  red: '#EF4444',
  redSoft: '#2E0A0A',
  amber: '#F59E0B',
  amberSoft: '#2E2A0A',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 36, backgroundColor: c.bg, fontFamily: 'Helvetica', fontSize: 10, color: c.text },
  brandBar: { height: 3, marginBottom: 14 },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 12 },
  logoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: c.text, marginBottom: 4 },
  subtitle: { fontSize: 11, color: c.textSecondary, marginBottom: 2 },
  meta: { fontSize: 9, color: c.muted },

  section: { marginTop: 14, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.border },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.text },

  card: { backgroundColor: c.surface, borderRadius: 6, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: c.borderLight },
  body: { fontSize: 10, color: c.textSecondary, lineHeight: 1.6 },

  // Two-column layout
  twoCol: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  // Overall score
  scoreContainer: { alignItems: 'center' as const, justifyContent: 'center' as const, padding: 20 },
  scoreValue: { fontSize: 48, fontFamily: 'Helvetica-Bold' },
  scoreLabel: { fontSize: 10, color: c.muted, marginTop: 4 },
  scoreSuffix: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: c.muted },

  // Scorecard grid
  scorecardGrid: { flexDirection: 'row', flexWrap: 'wrap' as const, gap: 6 },
  scorecardCard: { width: '48%', backgroundColor: c.surface, borderRadius: 6, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: c.borderLight },
  scorecardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  scorecardLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: c.text, flex: 1 },
  scorecardValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  scorecardCategory: { fontSize: 7, color: c.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 2 },
  scorecardDesc: { fontSize: 8, color: c.muted, lineHeight: 1.4, marginTop: 4 },

  // Context card
  contextGrid: { flexDirection: 'row', flexWrap: 'wrap' as const, gap: 6 },
  contextBox: { width: '48%', backgroundColor: c.surface, borderRadius: 6, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: c.borderLight },
  contextLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  contextValue: { fontSize: 9, color: c.textSecondary, lineHeight: 1.4 },

  // Platform metrics
  platformCard: { backgroundColor: c.surface, borderRadius: 6, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.borderLight },
  platformName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.text, textTransform: 'capitalize' as const, marginBottom: 8 },
  metricsRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  metricBox: { flex: 1, backgroundColor: c.surfaceHover, borderRadius: 4, padding: 8, alignItems: 'center' as const },
  metricValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: c.accent },
  metricLabel: { fontSize: 7, color: c.muted, marginTop: 2, textTransform: 'uppercase' as const },

  // Competitor table
  tableHeader: { flexDirection: 'row', backgroundColor: c.surfaceHover, borderRadius: 4, padding: 6, marginBottom: 4 },
  tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: c.borderLight },
  tableCell: { flex: 1, fontSize: 8, color: c.textSecondary },
  tableCellBold: { flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.text },
  tableHeaderText: { flex: 1, fontSize: 7, fontFamily: 'Helvetica-Bold', color: c.muted, textTransform: 'uppercase' as const },

  // Footer
  footer: { position: 'absolute' as const, bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: c.muted },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function scoreColor(score: number): string {
  if (score >= 70) return c.green;
  if (score >= 40) return c.amber;
  return c.red;
}

function statusColor(status: ScoreStatus): string {
  if (status === 'good') return c.green;
  if (status === 'warning') return c.amber;
  return c.red;
}

function SectionHeader({ title, dotColor }: { title: string; dotColor?: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionDot, { backgroundColor: dotColor ?? c.accent }]} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function FooterBar({ isAC, dateStr }: { isAC: boolean; dateStr: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{isAC ? 'Anderson Collaborative' : 'Nativz'} Cortex · Social media audit</Text>
      <Text style={s.footerText}>{dateStr}</Text>
    </View>
  );
}

// ─── Main document ────────────────────────────────────────────────────────────

interface AuditPdfDocumentProps {
  websiteContext: WebsiteContext | null;
  platforms: PlatformReport[];
  competitors: CompetitorProfile[];
  scorecard: AuditScorecard | null;
  agency?: string | null;
}

export function AuditPdfDocument({ websiteContext, platforms, competitors, scorecard, agency }: AuditPdfDocumentProps) {
  const isAC = agency?.toLowerCase().includes('anderson') || agency?.toLowerCase() === 'ac';
  const logo = isAC ? AC_LOGO_PNG : NATIVZ_LOGO_ON_LIGHT_PNG;
  const brandColor = isAC ? c.green : c.accent;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const overallScore = scorecard?.overallScore ?? 0;
  const overallScoreColor = scoreColor(overallScore);

  return (
    <Document>
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PAGE 1: Overview                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        <View style={[s.brandBar, { backgroundColor: brandColor }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View>
              <Text style={s.title}>Social media audit</Text>
              <Text style={s.subtitle}>
                {websiteContext?.title ?? websiteContext?.url ?? 'Prospect audit'}
              </Text>
              {websiteContext?.url && (
                <Text style={s.meta}>{websiteContext.url}</Text>
              )}
              <Text style={s.meta}>
                {dateStr} · {platforms.length} platform{platforms.length !== 1 ? 's' : ''} analyzed
              </Text>
            </View>
            <Image src={logo} style={{ width: 80, height: 20 }} />
          </View>
        </View>

        {/* Overall score + Executive summary — two columns */}
        <View style={s.section}>
          <View style={s.twoCol}>
            {/* Score */}
            <View style={s.col}>
              <SectionHeader title="Overall score" dotColor={overallScoreColor} />
              <View style={[s.card, { alignItems: 'center' as const, paddingVertical: 20 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  <Text style={[s.scoreValue, { color: overallScoreColor }]}>
                    {overallScore}
                  </Text>
                  <Text style={s.scoreSuffix}>/100</Text>
                </View>
                <Text style={s.scoreLabel}>
                  {overallScore >= 70 ? 'Strong presence' : overallScore >= 40 ? 'Needs improvement' : 'Significant gaps'}
                </Text>
              </View>
            </View>

            {/* Summary */}
            <View style={s.col}>
              <SectionHeader title="Executive summary" dotColor={brandColor} />
              <View style={s.card}>
                <Text style={s.body}>
                  {scorecard?.summary ?? 'No summary available.'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Website context */}
        {websiteContext && (
          <View style={s.section}>
            <SectionHeader title="Website context" dotColor={c.accent} />
            <View style={s.contextGrid}>
              {websiteContext.industry && (
                <View style={s.contextBox}>
                  <Text style={s.contextLabel}>Industry</Text>
                  <Text style={s.contextValue}>{websiteContext.industry}</Text>
                </View>
              )}
              {websiteContext.description && (
                <View style={s.contextBox}>
                  <Text style={s.contextLabel}>Description</Text>
                  <Text style={s.contextValue}>{websiteContext.description}</Text>
                </View>
              )}
              {websiteContext.keywords && websiteContext.keywords.length > 0 && (
                <View style={s.contextBox}>
                  <Text style={s.contextLabel}>Keywords</Text>
                  <Text style={s.contextValue}>{websiteContext.keywords.join(', ')}</Text>
                </View>
              )}
              {websiteContext.socialLinks && websiteContext.socialLinks.length > 0 && (
                <View style={s.contextBox}>
                  <Text style={s.contextLabel}>Social profiles</Text>
                  {websiteContext.socialLinks.map((link, i) => (
                    <Text key={i} style={s.contextValue}>
                      {link.platform}: @{link.username}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        <FooterBar isAC={!!isAC} dateStr={dateStr} />
      </Page>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PAGE 2: Scorecard                                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {scorecard && scorecard.items.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionHeader title={`Scorecard (${scorecard.items.length} items)`} dotColor={overallScoreColor} />
            <View style={s.scorecardGrid}>
              {scorecard.items.map((item: ScorecardItem, i: number) => (
                <View key={i} style={s.scorecardCard} wrap={false}>
                  <Text style={s.scorecardCategory}>{item.category}</Text>
                  <View style={s.scorecardRow}>
                    <View style={[s.statusDot, { backgroundColor: statusColor(item.prospectStatus) }]} />
                    <Text style={s.scorecardLabel}>{item.label}</Text>
                  </View>
                  <Text style={[s.scorecardValue, { color: statusColor(item.prospectStatus) }]}>
                    {item.prospectValue}
                  </Text>
                  {item.description && (
                    <Text style={s.scorecardDesc}>{item.description}</Text>
                  )}
                  {item.competitors.length > 0 && (
                    <View style={{ marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: c.borderLight }}>
                      <Text style={{ fontSize: 7, color: c.muted, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
                        COMPETITORS
                      </Text>
                      {item.competitors.map((comp, j) => (
                        <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <View style={[s.statusDot, { width: 5, height: 5, borderRadius: 2.5, backgroundColor: statusColor(comp.status) }]} />
                          <Text style={{ fontSize: 7, color: c.textSecondary }}>
                            @{comp.username}: {comp.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          <FooterBar isAC={!!isAC} dateStr={dateStr} />
        </Page>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PAGE 3: Platforms & Competitors                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        {/* Platform metrics */}
        {platforms.length > 0 && (
          <View style={s.section}>
            <SectionHeader title={`Platform metrics (${platforms.length})`} dotColor={brandColor} />
            {platforms.map((platform, i) => (
              <View key={i} style={s.platformCard} wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={s.platformName}>{platform.platform}</Text>
                  <Text style={{ fontSize: 8, color: c.muted }}>
                    @{platform.profile.username}
                    {platform.profile.verified ? ' ✓' : ''}
                  </Text>
                </View>
                <View style={s.metricsRow}>
                  <View style={s.metricBox}>
                    <Text style={s.metricValue}>{fmtNum(platform.profile.followers)}</Text>
                    <Text style={s.metricLabel}>Followers</Text>
                  </View>
                  <View style={s.metricBox}>
                    <Text style={[s.metricValue, { color: c.green }]}>
                      {platform.engagementRate != null ? `${platform.engagementRate.toFixed(1)}%` : '—'}
                    </Text>
                    <Text style={s.metricLabel}>Engagement</Text>
                  </View>
                  <View style={s.metricBox}>
                    <Text style={[s.metricValue, { color: c.amber }]}>{fmtNum(platform.avgViews)}</Text>
                    <Text style={s.metricLabel}>Avg views</Text>
                  </View>
                  <View style={s.metricBox}>
                    <Text style={[s.metricValue, { color: c.textSecondary }]}>{platform.postingFrequency ?? '—'}</Text>
                    <Text style={s.metricLabel}>Frequency</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Competitor comparison table */}
        {competitors.length > 0 && (
          <View style={s.section}>
            <SectionHeader title={`Competitor comparison (${competitors.length})`} dotColor={c.amber} />
            <View style={s.card}>
              {/* Table header */}
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderText, { flex: 2 }]}>Account</Text>
                <Text style={s.tableHeaderText}>Platform</Text>
                <Text style={s.tableHeaderText}>Followers</Text>
                <Text style={s.tableHeaderText}>Eng. rate</Text>
                <Text style={s.tableHeaderText}>Avg views</Text>
                <Text style={s.tableHeaderText}>Frequency</Text>
              </View>
              {/* Table rows */}
              {competitors.map((comp, i) => (
                <View key={i} style={s.tableRow} wrap={false}>
                  <View style={{ flex: 2 }}>
                    <Text style={s.tableCellBold}>
                      {comp.displayName || comp.username}
                    </Text>
                    <Text style={{ fontSize: 7, color: c.muted }}>@{comp.username}</Text>
                  </View>
                  <Text style={[s.tableCell, { textTransform: 'capitalize' as const }]}>{comp.platform}</Text>
                  <Text style={s.tableCell}>{fmtNum(comp.followers)}</Text>
                  <Text style={s.tableCell}>
                    {comp.engagementRate != null ? `${comp.engagementRate.toFixed(1)}%` : '—'}
                  </Text>
                  <Text style={s.tableCell}>{fmtNum(comp.avgViews)}</Text>
                  <Text style={s.tableCell}>{comp.postingFrequency ?? '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <FooterBar isAC={!!isAC} dateStr={dateStr} />
      </Page>
    </Document>
  );
}
