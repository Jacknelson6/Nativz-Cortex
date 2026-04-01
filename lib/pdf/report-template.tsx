import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { AC_LOGO_PNG } from '@/lib/brand-logo';
import { NativzLogoPdf } from '@/lib/pdf/nativz-logo-pdf';
import type { SummaryReport, TopPostItem, PlatformSummary } from '@/lib/types/reporting';

// ─── Light theme palette (client-facing print) ────────────────────────────────

const c = {
  bg: '#FFFFFF',
  surface: '#F8F9FB',
  text: '#1A1A2E',
  textSecondary: '#4B5563',
  muted: '#9CA3AF',
  border: '#E5E7EB',
  accent: '#046BD2',
  accentSoft: '#EBF4FF',
  green: '#059669',
  greenSoft: '#ECFDF5',
  red: '#DC2626',
  redSoft: '#FEF2F2',
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: c.text,
    backgroundColor: c.bg,
  },
  brandBar: { height: 3, marginBottom: 16 },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingBottom: 14,
  },
  logoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    marginBottom: 4,
  },
  subtitle: { fontSize: 11, color: c.textSecondary, marginBottom: 2 },
  meta: { fontSize: 9, color: c.muted },

  section: { marginTop: 16, marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.text },

  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricBox: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 6,
    padding: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: c.border,
  },
  metricValue: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: c.accent,
  },
  metricLabel: { fontSize: 8, color: c.muted, marginTop: 3 },
  metricChange: { fontSize: 8, marginTop: 2 },

  // Platform table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  thCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: c.muted,
    textTransform: 'uppercase' as const,
  },
  tdCell: { fontSize: 9, color: c.text },

  // Top posts
  postRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'center' as const,
  },
  rankBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rankText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },

  footer: {
    position: 'absolute' as const,
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: c.muted },
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatChange(n: number): string {
  const prefix = n >= 0 ? '+' : '';
  return `${prefix}${formatNumber(n)}`;
}

function formatPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function SectionHeader({ title, dotColor }: { title: string; dotColor?: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionDot, { backgroundColor: dotColor ?? c.accent }]} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
  };
  return labels[platform] ?? platform;
}

// ─── Main document ─────────────────────────────────────────────────────────────

export interface ReportSections {
  performanceSummary: boolean;
  platformBreakdown: boolean;
  topPosts: boolean;
  topPostsCount: number;
}

export interface ReportPdfDocumentProps {
  clientName: string;
  agency?: string | null;
  logoUrl?: string | null;
  dateRange: { start: string; end: string };
  summary: SummaryReport | null;
  topPosts: TopPostItem[];
  sections: ReportSections;
}

export function ReportPdfDocument({
  clientName,
  agency,
  logoUrl,
  dateRange,
  summary,
  topPosts,
  sections,
}: ReportPdfDocumentProps) {
  const isAC =
    agency?.toLowerCase().includes('anderson') ||
    agency?.toLowerCase() === 'ac';
  const brandColor = isAC ? c.green : c.accent;
  const brandName = isAC ? 'Anderson Collaborative' : 'Nativz';

  const startDate = new Date(dateRange.start + 'T00:00:00').toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' },
  );
  const endDate = new Date(dateRange.end + 'T00:00:00').toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' },
  );

  const combined = summary?.combined;
  const platforms: PlatformSummary[] = summary?.platforms ?? [];

  return (
    <Document>
      {/* ── Page 1: Performance summary + platform breakdown ──────────────── */}
      <Page size="A4" style={s.page}>
        <View style={[s.brandBar, { backgroundColor: brandColor }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View>
              <Text style={s.title}>Performance report</Text>
              <Text style={s.subtitle}>{clientName}</Text>
              <Text style={s.meta}>
                {startDate} — {endDate}
              </Text>
            </View>
            {logoUrl ? (
              <Image src={logoUrl} style={{ width: 80, height: 20 }} />
            ) : isAC ? (
              <Image src={AC_LOGO_PNG} style={{ width: 80, height: 20 }} />
            ) : (
              <NativzLogoPdf width={80} />
            )}
          </View>
        </View>

        {/* Metric cards */}
        {sections.performanceSummary && combined && (
          <View style={s.section}>
            <SectionHeader title="Performance summary" />
            <View style={s.metricsRow}>
              <View style={s.metricBox}>
                <Text style={s.metricValue}>
                  {formatNumber(combined.totalViews ?? 0)}
                </Text>
                <Text style={s.metricLabel}>Total views</Text>
                <Text
                  style={[
                    s.metricChange,
                    {
                      color:
                        (combined.totalViewsChange ?? 0) >= 0
                          ? c.green
                          : c.red,
                    },
                  ]}
                >
                  {formatChange(combined.totalViewsChange ?? 0)} vs prev
                </Text>
              </View>
              <View style={s.metricBox}>
                <Text style={[s.metricValue, { color: c.green }]}>
                  {formatNumber(combined.totalFollowerChange ?? 0)}
                </Text>
                <Text style={s.metricLabel}>Followers gained</Text>
                <Text
                  style={[
                    s.metricChange,
                    {
                      color:
                        (combined.totalFollowerChangeChange ?? 0) >= 0
                          ? c.green
                          : c.red,
                    },
                  ]}
                >
                  {formatChange(combined.totalFollowerChangeChange ?? 0)} vs
                  prev
                </Text>
              </View>
              <View style={s.metricBox}>
                <Text style={s.metricValue}>
                  {formatNumber(combined.totalEngagement ?? 0)}
                </Text>
                <Text style={s.metricLabel}>Total engagement</Text>
                <Text
                  style={[
                    s.metricChange,
                    {
                      color:
                        (combined.totalEngagementChange ?? 0) >= 0
                          ? c.green
                          : c.red,
                    },
                  ]}
                >
                  {formatChange(combined.totalEngagementChange ?? 0)} vs prev
                </Text>
              </View>
              <View style={s.metricBox}>
                <Text style={[s.metricValue, { color: brandColor }]}>
                  {formatPct(combined.avgEngagementRate ?? 0)}
                </Text>
                <Text style={s.metricLabel}>Avg engagement rate</Text>
                <Text
                  style={[
                    s.metricChange,
                    {
                      color:
                        (combined.avgEngagementRateChange ?? 0) >= 0
                          ? c.green
                          : c.red,
                    },
                  ]}
                >
                  {(combined.avgEngagementRateChange ?? 0) >= 0 ? '+' : ''}
                  {(combined.avgEngagementRateChange ?? 0).toFixed(2)}% vs prev
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Platform breakdown table */}
        {sections.platformBreakdown && platforms.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Platform breakdown" dotColor={brandColor} />
            {/* Table header */}
            <View style={s.tableHeader}>
              <Text style={[s.thCell, { width: '20%' }]}>Platform</Text>
              <Text style={[s.thCell, { width: '16%', textAlign: 'right' }]}>
                Followers
              </Text>
              <Text style={[s.thCell, { width: '16%', textAlign: 'right' }]}>
                Change
              </Text>
              <Text style={[s.thCell, { width: '16%', textAlign: 'right' }]}>
                Views
              </Text>
              <Text style={[s.thCell, { width: '16%', textAlign: 'right' }]}>
                Engagement
              </Text>
              <Text style={[s.thCell, { width: '16%', textAlign: 'right' }]}>
                Rate
              </Text>
            </View>
            {/* Table rows */}
            {platforms.map((p, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={[s.tdCell, { width: '20%' }]}>
                  {platformLabel(p.platform)}{' '}
                  <Text style={{ color: c.muted, fontSize: 8 }}>
                    @{p.username ?? ''}
                  </Text>
                </Text>
                <Text
                  style={[s.tdCell, { width: '16%', textAlign: 'right' }]}
                >
                  {formatNumber(p.followers ?? 0)}
                </Text>
                <Text
                  style={[
                    s.tdCell,
                    {
                      width: '16%',
                      textAlign: 'right',
                      color:
                        (p.followerChange ?? 0) >= 0 ? c.green : c.red,
                    },
                  ]}
                >
                  {formatChange(p.followerChange ?? 0)}
                </Text>
                <Text
                  style={[s.tdCell, { width: '16%', textAlign: 'right' }]}
                >
                  {formatNumber(p.totalViews ?? 0)}
                </Text>
                <Text
                  style={[s.tdCell, { width: '16%', textAlign: 'right' }]}
                >
                  {formatNumber(p.totalEngagement ?? 0)}
                </Text>
                <Text
                  style={[s.tdCell, { width: '16%', textAlign: 'right' }]}
                >
                  {formatPct(p.engagementRate ?? 0)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Prepared by {brandName}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ── Page 2 (optional): Top posts ─────────────────────────────────── */}
      {sections.topPosts && topPosts.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionHeader
              title={`Top ${topPosts.length} posts`}
              dotColor={c.green}
            />

            {/* Table header */}
            <View style={s.tableHeader}>
              <Text style={[s.thCell, { width: '5%' }]}>#</Text>
              <Text style={[s.thCell, { width: '13%' }]}>Platform</Text>
              <Text style={[s.thCell, { width: '36%' }]}>Caption</Text>
              <Text style={[s.thCell, { width: '12%', textAlign: 'right' }]}>
                Views
              </Text>
              <Text style={[s.thCell, { width: '12%', textAlign: 'right' }]}>
                Likes
              </Text>
              <Text style={[s.thCell, { width: '11%', textAlign: 'right' }]}>
                Comments
              </Text>
              <Text style={[s.thCell, { width: '11%', textAlign: 'right' }]}>
                Shares
              </Text>
            </View>

            {/* Post rows */}
            {topPosts.map((post, i) => (
              <View key={i} style={s.postRow} wrap={false}>
                <View style={[s.rankBadge, { width: '5%' }]}>
                  <Text style={s.rankText}>{post.rank}</Text>
                </View>
                <Text style={[s.tdCell, { width: '13%' }]}>
                  {platformLabel(post.platform)}
                </Text>
                <Text
                  style={[
                    s.tdCell,
                    { width: '36%', fontSize: 8, color: c.textSecondary },
                  ]}
                >
                  {(post.caption ?? '').slice(0, 80)}
                  {(post.caption ?? '').length > 80 ? '…' : ''}
                </Text>
                <Text
                  style={[s.tdCell, { width: '12%', textAlign: 'right' }]}
                >
                  {formatNumber(post.views ?? 0)}
                </Text>
                <Text
                  style={[s.tdCell, { width: '12%', textAlign: 'right' }]}
                >
                  {formatNumber(post.likes ?? 0)}
                </Text>
                <Text
                  style={[s.tdCell, { width: '11%', textAlign: 'right' }]}
                >
                  {formatNumber(post.comments ?? 0)}
                </Text>
                <Text
                  style={[s.tdCell, { width: '11%', textAlign: 'right' }]}
                >
                  {formatNumber(post.shares ?? 0)}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.footer} fixed>
            <Text style={s.footerText}>
              Prepared by {brandName}
            </Text>
            <Text
              style={s.footerText}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </Page>
      )}
    </Document>
  );
}
