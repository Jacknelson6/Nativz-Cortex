import React from 'react';
import { Document, Page, Text, View, StyleSheet, Link, Image as PdfImage } from '@react-pdf/renderer';
import { NativzLogoPdf } from '@/lib/pdf/nativz-logo-pdf';
import { AC_LOGO_PNG } from '@/lib/brand-logo';
import type { MoodboardItem, TranscriptSegment, RescriptData } from '@/lib/types/moodboard';

// ─── Palette ────────────────────────────────────────────────────────────────────

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
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
};

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: c.text,
    backgroundColor: c.bg,
  },
  brandBar: { height: 3, backgroundColor: c.accent, marginBottom: 16 },

  // Header
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
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  link: { fontSize: 9, color: c.accent, textDecoration: 'none' },

  // Sections
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

  // Hook quote
  hookQuote: {
    backgroundColor: c.accentSoft,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
  },
  hookQuoteText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Oblique',
    color: c.text,
    lineHeight: 1.5,
  },

  // Score row
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  scoreBox: {
    backgroundColor: c.surface,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    width: 80,
  },
  scoreValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: c.accent },
  scoreLabel: { fontSize: 8, color: c.muted, marginTop: 2 },
  infoBox: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  infoLabel: { fontSize: 8, color: c.muted, marginBottom: 3, textTransform: 'uppercase' as const },
  infoText: { fontSize: 10, color: c.text, lineHeight: 1.5 },

  // Lists
  listItem: { flexDirection: 'row', gap: 6, marginBottom: 3 },
  bulletGreen: { fontSize: 10, color: c.green },
  bulletAmber: { fontSize: 10, color: c.amber },
  listText: { fontSize: 9, color: c.textSecondary, flex: 1, lineHeight: 1.4 },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  tag: {
    backgroundColor: c.surface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: c.border,
  },
  tagText: { fontSize: 8, color: c.textSecondary },

  // Transcript
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 2, paddingVertical: 2 },
  timestamp: { fontSize: 8, color: c.accent, fontFamily: 'Courier', width: 32 },
  segmentText: { fontSize: 9, color: c.textSecondary, flex: 1, lineHeight: 1.4 },
  transcriptBlock: {
    fontSize: 9,
    color: c.textSecondary,
    lineHeight: 1.6,
    backgroundColor: c.surface,
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: c.border,
  },

  // Rescript
  rescriptSection: { marginBottom: 8 },
  rescriptLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.text, marginBottom: 3 },
  rescriptText: { fontSize: 9, color: c.textSecondary, lineHeight: 1.5 },
  shotRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 3,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  shotNum: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.accent, width: 20 },
  shotDesc: { fontSize: 9, color: c.textSecondary, flex: 1 },
  shotTiming: { fontSize: 8, color: c.muted, width: 50, textAlign: 'right' as const },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statBox: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 6,
    padding: 8,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: c.border,
  },
  statValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: c.text },
  statLabel: { fontSize: 7, color: c.muted, marginTop: 2 },

  // Footer
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatTag(str: string): string {
  return str.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
}

function SectionHeader({ title, dotColor }: { title: string; dotColor?: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionDot, { backgroundColor: dotColor ?? c.accent }]} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Document ───────────────────────────────────────────────────────────────────

export interface AnalysisPdfProps {
  item: MoodboardItem;
  clientName: string | null;
  agency?: string | null;
}

export function AnalysisPdfDocument({ item, clientName, agency }: AnalysisPdfProps) {
  const isAC = agency?.toLowerCase().includes('anderson') || agency?.toLowerCase() === 'ac';
  const brandName = isAC ? 'Anderson Collaborative' : 'Nativz';
  const platform = (item.platform ?? 'unknown').charAt(0).toUpperCase() + (item.platform ?? 'unknown').slice(1);
  const segments: TranscriptSegment[] = item.transcript_segments ?? [];
  const rescript: RescriptData | null = item.rescript;
  const hasHook = item.hook_score != null;
  const hasTranscript = !!item.transcript || segments.length > 0;
  const hasRescript = !!rescript || !!item.replication_brief;
  const themes = item.content_themes ?? [];
  const wins = item.winning_elements ?? [];
  const improvements = item.improvement_areas ?? [];

  return (
    <Document>
      {/* ── Page 1: Overview + Hook Analysis ──────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.brandBar} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.title || 'Video analysis'}</Text>
              {clientName && <Text style={s.subtitle}>{clientName}</Text>}
              <View style={s.metaRow}>
                <Text style={s.meta}>Platform: {platform}</Text>
                {item.duration && (
                  <Text style={s.meta}>
                    Duration: {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                  </Text>
                )}
                <Text style={s.meta}>
                  Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <Link src={item.url} style={s.link}>{item.url}</Link>
            </View>
            {isAC ? <PdfImage src={AC_LOGO_PNG} style={{ width: 80, height: 20, objectFit: 'contain' as const }} /> : <NativzLogoPdf width={80} />}
          </View>
        </View>

        {/* Stats */}
        {item.stats && (
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statValue}>{formatNumber(item.stats.views)}</Text>
              <Text style={s.statLabel}>Views</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{formatNumber(item.stats.likes)}</Text>
              <Text style={s.statLabel}>Likes</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{formatNumber(item.stats.comments)}</Text>
              <Text style={s.statLabel}>Comments</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{formatNumber(item.stats.shares)}</Text>
              <Text style={s.statLabel}>Shares</Text>
            </View>
          </View>
        )}

        {/* Hook Analysis */}
        {hasHook && (
          <View style={s.section}>
            <SectionHeader title="Hook analysis" />

            {item.hook && (
              <View style={s.hookQuote}>
                <Text style={s.hookQuoteText}>&ldquo;{item.hook}&rdquo;</Text>
              </View>
            )}

            <View style={s.scoreRow}>
              <View style={s.scoreBox}>
                <Text style={s.scoreValue}>{item.hook_score}/10</Text>
                <Text style={s.scoreLabel}>Hook score</Text>
              </View>
              {item.hook_type && (
                <View style={s.infoBox}>
                  <Text style={s.infoLabel}>Hook type</Text>
                  <Text style={s.infoText}>{formatTag(item.hook_type)}</Text>
                  {item.hook_analysis && (
                    <>
                      <Text style={[s.infoLabel, { marginTop: 6 }]}>Why it works</Text>
                      <Text style={s.infoText}>{item.hook_analysis}</Text>
                    </>
                  )}
                </View>
              )}
            </View>

            {item.concept_summary && (
              <View style={{ marginBottom: 8 }}>
                <Text style={s.infoLabel}>Summary</Text>
                <Text style={s.infoText}>{item.concept_summary}</Text>
              </View>
            )}
          </View>
        )}

        {/* Themes */}
        {themes.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Content themes" dotColor={c.accent} />
            <View style={s.tagsRow}>
              {themes.map((tag, i) => (
                <View key={i} style={s.tag}>
                  <Text style={s.tagText}>{formatTag(tag)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* What works + improvements side by side */}
        {(wins.length > 0 || improvements.length > 0) && (
          <View style={s.section}>
            <SectionHeader title="Strengths and improvements" dotColor={c.green} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {wins.length > 0 && (
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoLabel, { color: c.green }]}>What works</Text>
                  {wins.map((el, i) => (
                    <View key={i} style={s.listItem}>
                      <Text style={s.bulletGreen}>+</Text>
                      <Text style={s.listText}>{el}</Text>
                    </View>
                  ))}
                </View>
              )}
              {improvements.length > 0 && (
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoLabel, { color: c.amber }]}>Could improve</Text>
                  {improvements.map((el, i) => (
                    <View key={i} style={s.listItem}>
                      <Text style={s.bulletAmber}>-</Text>
                      <Text style={s.listText}>{el}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* CTA */}
        {item.cta && (
          <View style={[s.section, { backgroundColor: c.amberSoft, padding: 10, borderRadius: 4 }]}>
            <Text style={[s.infoLabel, { color: c.amber }]}>Call to action</Text>
            <Text style={s.infoText}>{item.cta}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Prepared by {brandName}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* ── Page 2: Transcript ────────────────────────────────────────────── */}
      {hasTranscript && (
        <Page size="A4" style={s.page}>
          <View style={s.brandBar} />
          <View style={s.section}>
            <SectionHeader title="Transcript" />

            {segments.length > 0 ? (
              <View>
                {segments.map((seg, i) => (
                  <View key={i} style={s.segmentRow} wrap={false}>
                    <Text style={s.timestamp}>{formatTimestamp(seg.start)}</Text>
                    <Text style={s.segmentText}>{seg.text}</Text>
                  </View>
                ))}
              </View>
            ) : item.transcript ? (
              <Text style={s.transcriptBlock}>{item.transcript}</Text>
            ) : null}
          </View>

          <View style={s.footer} fixed>
            <Text style={s.footerText}>Prepared by {brandName}</Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* ── Page 3: Rescript ──────────────────────────────────────────────── */}
      {hasRescript && (
        <Page size="A4" style={s.page}>
          <View style={s.brandBar} />
          <View style={s.section}>
            <SectionHeader title="Rescript" dotColor={c.green} />

            {rescript ? (
              <View>
                {/* Adapted script */}
                <View style={s.rescriptSection}>
                  <Text style={s.rescriptLabel}>Adapted script</Text>
                  <Text style={s.rescriptText}>{rescript.adapted_script}</Text>
                </View>

                {/* Shot list */}
                {rescript.shot_list?.length > 0 && (
                  <View style={s.rescriptSection}>
                    <Text style={s.rescriptLabel}>Shot list</Text>
                    {rescript.shot_list.map((shot, i) => (
                      <View key={i} style={s.shotRow} wrap={false}>
                        <Text style={s.shotNum}>#{shot.number}</Text>
                        <Text style={s.shotDesc}>{shot.description}{shot.notes ? ` — ${shot.notes}` : ''}</Text>
                        <Text style={s.shotTiming}>{shot.timing}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Hook alternatives */}
                {rescript.hook_alternatives?.length > 0 && (
                  <View style={s.rescriptSection}>
                    <Text style={s.rescriptLabel}>Hook alternatives</Text>
                    {rescript.hook_alternatives.map((alt, i) => (
                      <View key={i} style={s.listItem}>
                        <Text style={{ fontSize: 9, color: c.accent }}>{i + 1}.</Text>
                        <Text style={s.listText}>{alt}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Hashtags */}
                {rescript.hashtags?.length > 0 && (
                  <View style={s.rescriptSection}>
                    <Text style={s.rescriptLabel}>Hashtags</Text>
                    <Text style={s.rescriptText}>{rescript.hashtags.join('  ')}</Text>
                  </View>
                )}

                {/* Posting strategy */}
                {rescript.posting_strategy && (
                  <View style={s.rescriptSection}>
                    <Text style={s.rescriptLabel}>Posting strategy</Text>
                    <Text style={s.rescriptText}>{rescript.posting_strategy}</Text>
                  </View>
                )}
              </View>
            ) : item.replication_brief ? (
              <Text style={s.rescriptText}>{item.replication_brief}</Text>
            ) : null}
          </View>

          <View style={s.footer} fixed>
            <Text style={s.footerText}>Prepared by {brandName}</Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}
