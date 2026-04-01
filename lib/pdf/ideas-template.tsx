import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { AC_LOGO_PNG } from '@/lib/brand-logo';
import { NativzLogoPdf } from '@/lib/pdf/nativz-logo-pdf';

// ─── Agency color palettes ──────────────────────────────────────────────────

const palettes = {
  nativz: {
    accent: '#046BD2',
    accentSoft: '#EBF4FF',
    accentMuted: '#93C5FD',
  },
  ac: {
    accent: '#059669',
    accentSoft: '#ECFDF5',
    accentMuted: '#6EE7B7',
  },
};

const c = {
  bg: '#FFFFFF',
  surface: '#F8F9FB',
  text: '#1A1A2E',
  textSecondary: '#4B5563',
  muted: '#9CA3AF',
  border: '#E5E7EB',
  purple: '#8B5CF6',
  purpleSoft: '#F3F0FF',
};

// ─── Styles ─────────────────────────────────────────────────────────────────

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

  // Idea cards
  ideaCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    overflow: 'hidden' as const,
  },
  ideaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingBottom: 8,
  },
  ideaNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ideaNumberText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  ideaTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    flex: 1,
  },
  ideaBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  reasonBullet: {
    fontSize: 8,
    marginTop: 2,
  },
  reasonText: {
    fontSize: 9,
    color: c.textSecondary,
    flex: 1,
  },
  pillarTag: {
    marginTop: 6,
    backgroundColor: c.surface,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start' as const,
  },
  pillarText: {
    fontSize: 8,
    color: c.muted,
    textTransform: 'uppercase' as const,
  },

  // Script section
  scriptSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: c.surface,
  },
  scriptLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: c.muted,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  scriptText: {
    fontSize: 9,
    color: c.textSecondary,
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    position: 'absolute' as const,
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: c.muted },
});

// ─── Component ──────────────────────────────────────────────────────────────

interface IdeaForPdf {
  title: string;
  why_it_works: string[];
  content_pillar: string;
  script?: string;
}

interface IdeasPdfProps {
  ideas: IdeaForPdf[];
  clientName: string;
  agency: string | null;
  concept: string | null;
  searchQuery: string | null;
  includeScripts?: boolean;
}

export function IdeasPdfDocument({
  ideas,
  clientName,
  agency,
  concept,
  searchQuery,
  includeScripts = true,
}: IdeasPdfProps) {
  const isAC = agency?.toLowerCase().includes('anderson');
  const palette = isAC ? palettes.ac : palettes.nativz;

  const heading = `${ideas.length} ${concept ?? 'video'} ideas${searchQuery ? ` from ${searchQuery} research` : ''}`;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Brand accent bar */}
        <View style={[s.brandBar, { backgroundColor: palette.accent }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{heading}</Text>
              <Text style={s.subtitle}>{clientName}</Text>
              <Text style={s.meta}>{date}</Text>
            </View>
            {isAC ? (
              <Image src={AC_LOGO_PNG} style={{ width: 60, height: 20, objectFit: 'contain' as const }} />
            ) : (
              <NativzLogoPdf width={60} />
            )}
          </View>
        </View>

        {/* Ideas */}
        {ideas.map((idea, i) => (
          <View key={i} style={s.ideaCard} wrap={false}>
            <View style={s.ideaHeader}>
              <View style={[s.ideaNumber, { backgroundColor: palette.accent }]}>
                <Text style={s.ideaNumberText}>{i + 1}</Text>
              </View>
              <Text style={s.ideaTitle}>{idea.title}</Text>
            </View>

            <View style={s.ideaBody}>
              {idea.why_it_works.map((reason, j) => (
                <View key={j} style={s.reason}>
                  <Text style={[s.reasonBullet, { color: palette.accent }]}>●</Text>
                  <Text style={s.reasonText}>{reason}</Text>
                </View>
              ))}

              {idea.content_pillar && (
                <View style={s.pillarTag}>
                  <Text style={s.pillarText}>{idea.content_pillar}</Text>
                </View>
              )}
            </View>

            {includeScripts && idea.script && (
              <View style={s.scriptSection}>
                <Text style={s.scriptLabel}>Script</Text>
                <Text style={s.scriptText}>{idea.script}</Text>
              </View>
            )}
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {isAC ? 'Anderson Collaborative' : 'Nativz'} — Confidential
          </Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
