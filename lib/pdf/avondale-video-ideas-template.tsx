import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { NativzLogoPdf } from '@/lib/pdf/nativz-logo-pdf';
import type { AvondaleVideoIdea } from '@/lib/pdf/avondale-video-ideas-data';

/** Nativz “z” cyan sampled from wordmark PNG (≈ rgb(0,174,239)). */
const palette = {
  accent: '#00AEEF',
  accentMuted: '#7DD3FC',
};

const c = {
  bg: '#FFFFFF',
  surface: '#F8F9FB',
  text: '#1A1A2E',
  textSecondary: '#4B5563',
  muted: '#9CA3AF',
  border: '#E5E7EB',
};

const s = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: c.text,
    backgroundColor: c.bg,
  },
  brandBar: { height: 4, marginBottom: 14, backgroundColor: palette.accent },
  logoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  coverTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    marginBottom: 6,
  },
  coverSubtitle: { fontSize: 11, color: c.textSecondary, marginBottom: 10 },
  coverMeta: { fontSize: 8, color: c.muted, marginBottom: 14 },
  introBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  introHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    marginBottom: 6,
  },
  introText: { fontSize: 8, color: c.textSecondary, lineHeight: 1.45, marginBottom: 4 },
  reportPill: {
    alignSelf: 'flex-start' as const,
    backgroundColor: '#E6FAFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 6,
  },
  reportPillText: { fontSize: 7, color: palette.accent, fontFamily: 'Helvetica-Bold' },

  ideaCard: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    overflow: 'hidden' as const,
  },
  ideaTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    paddingBottom: 8,
  },
  ideaNum: {
    width: 24,
    height: 24,
    minWidth: 24,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  ideaNumText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  /** Do not put flex:1 on Text in react-pdf — it causes title/lane overlap. */
  ideaTextColumn: {
    flex: 1,
    flexDirection: 'column' as const,
    alignSelf: 'stretch' as const,
    maxWidth: '100%',
  },
  ideaTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    lineHeight: 1.4,
    marginBottom: 5,
    width: '100%',
  },
  laneTag: {
    fontSize: 7,
    color: '#5B21B6',
    fontFamily: 'Helvetica',
    lineHeight: 1.35,
    width: '100%',
  },
  insightBlock: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 8,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  insightLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: c.muted,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  insightRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-start' as const },
  insightDot: { fontSize: 7, color: palette.accent, marginRight: 6, marginTop: 1, width: 8 },
  insightText: { fontSize: 8, color: c.textSecondary, flex: 1, lineHeight: 1.45 },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  pageHeaderTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: c.text },
  pageHeaderSub: { fontSize: 8, color: c.muted },

  footer: {
    position: 'absolute' as const,
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: c.muted },
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const IDEAS_PER_PAGE = 5;

interface AvondaleVideoIdeasPdfProps {
  ideas: AvondaleVideoIdea[];
  clientName?: string;
}

export function AvondaleVideoIdeasPdfDocument({
  ideas,
  clientName = 'Avondale Private Lending',
}: AvondaleVideoIdeasPdfProps) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const pages = chunk(ideas, IDEAS_PER_PAGE);
  const globalStart = (pageIndex: number) => pageIndex * IDEAS_PER_PAGE;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.brandBar} />
        <View style={s.logoRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.coverTitle}>Video content roadmap</Text>
            <Text style={s.coverSubtitle}>{ideas.length} data-backed video ideas</Text>
            <Text style={s.coverMeta}>
              {clientName} · Prepared by Nativz · {date}
            </Text>
          </View>
          <NativzLogoPdf width={72} />
        </View>

        <View style={s.introBox}>
          <Text style={s.introHeading}>Reports referenced</Text>
          <Text style={s.introText}>
            • Passive income through private lending real estate — investor education, risk and return, portfolio
            framing, and passive-income positioning aligned with partner-oriented messaging.
          </Text>
          <Text style={s.introText}>
            • Fix and flip construction lending — borrower education on draws, scope, documentation, and construction
            timelines; includes trending themes such as draw schedules, scope clarity, and disbursement risk called out
            in Cortex topic research.
          </Text>
          <Text style={s.introText}>
            Cross-cutting insights from the Nativz strategy discussion: prioritize plain-language explainers and
            checklists, reduce repetition with fresh scripts per pillar, use anonymous deal teardowns where appropriate,
            and address anxiety around funding continuity, draw timing, and paperwork directly.
          </Text>
          <View style={s.reportPill}>
            <Text style={s.reportPillText}>Confidential — client strategy</Text>
          </View>
        </View>

        <Text style={[s.pageHeaderSub, { marginBottom: 10 }]}>Ideas {1}–{Math.min(IDEAS_PER_PAGE, ideas.length)}</Text>
        {ideas.slice(0, IDEAS_PER_PAGE).map((idea, i) => (
          <IdeaCard key={i} index={i + 1} idea={idea} />
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Nativz — Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {pages.slice(1).map((block, pageIndex) => {
        const pageNum = pageIndex + 2;
        const start = globalStart(pageIndex + 1);
        const end = start + block.length;
        return (
          <Page key={pageNum} size="A4" style={s.page}>
            <View style={s.brandBar} />
            <View style={s.pageHeader}>
              <View>
                <Text style={s.pageHeaderTitle}>Video ideas (continued)</Text>
                <Text style={s.pageHeaderSub}>
                  {clientName} · Ideas {start + 1}–{end}
                </Text>
              </View>
              <NativzLogoPdf width={60} />
            </View>
            {block.map((idea, j) => (
              <IdeaCard key={start + j} index={start + j + 1} idea={idea} />
            ))}
            <View style={s.footer} fixed>
              <Text style={s.footerText}>Nativz — Confidential</Text>
              <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

function laneLabel(report: AvondaleVideoIdea['report']): string {
  if (report.includes('Passive income')) return 'Report: passive income / private lending (investor)';
  return 'Report: fix and flip / construction lending (borrower)';
}

function IdeaCard({ index, idea }: { index: number; idea: AvondaleVideoIdea }) {
  return (
    <View style={s.ideaCard}>
      <View style={s.ideaTop}>
        <View style={s.ideaNum}>
          <Text style={s.ideaNumText}>{index}</Text>
        </View>
        <View style={s.ideaTextColumn}>
          <Text style={s.ideaTitle}>{idea.title}</Text>
          <Text style={s.laneTag}>{laneLabel(idea.report)}</Text>
        </View>
      </View>
      <View style={s.insightBlock}>
        <Text style={s.insightLabel}>Report insights</Text>
        {idea.insights.map((line, k) => (
          <View key={k} style={s.insightRow}>
            <Text style={s.insightDot}>●</Text>
            <Text style={s.insightText}>{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
