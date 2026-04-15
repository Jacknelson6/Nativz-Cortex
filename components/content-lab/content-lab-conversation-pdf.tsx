import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { NATIVZ_LOGO_ON_LIGHT_PNG, AC_LOGO_PNG } from '@/lib/brand-logo';
import type { AgencyBrand } from '@/lib/agency/detect';
import { renderMarkdownToPdfBlocks } from './pdf-markdown';

// ─── Palette — light, client-facing ─────────────────────────────────────────

const c = {
  bg: '#FFFFFF',
  surface: '#F7F7FA',
  surfaceAccent: '#EEF3FB',
  border: '#E4E4EA',
  borderSoft: '#EDEEF2',
  text: '#0F1117',
  textSecondary: '#3F4252',
  muted: '#6A6A7A',
  mutedSoft: '#9A9AA8',
  nativzAccent: '#046BD2',
  nativzSoftBg: '#EEF6FF',
  acAccent: '#10B981',
  acSoftBg: '#ECF9F3',
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 56, // leave room for footer
    backgroundColor: c.bg,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: c.text,
  },

  // ── Header (cover page) ──
  brandBar: { height: 4, marginBottom: 18 },
  header: { marginBottom: 18 },
  logoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  agencyLogoImg: { maxHeight: 28, maxWidth: 120, objectFit: 'contain' as const },
  clientLogoImg: { maxHeight: 28, maxWidth: 120, objectFit: 'contain' as const },
  clientInitials: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.surfaceAccent,
    textAlign: 'center' as const,
    paddingTop: 8,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
  },
  titleBlock: { marginTop: 6 },
  kicker: {
    fontSize: 8,
    color: c.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: c.text, marginBottom: 4 },
  subtitle: { fontSize: 11, color: c.textSecondary, lineHeight: 1.4 },

  // ── Meta block (date / agency / client) ──
  metaGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 14,
  },
  metaCell: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: c.borderSoft,
  },
  metaLabel: {
    fontSize: 7,
    color: c.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metaValue: { fontSize: 10, color: c.text, fontFamily: 'Helvetica-Bold' },

  // ── Research section ──
  researchCard: {
    backgroundColor: c.surfaceAccent,
    borderRadius: 5,
    padding: 12,
    marginBottom: 18,
    borderLeftWidth: 3,
    borderLeftColor: c.nativzAccent, // overridden by inline style per-agency
  },
  researchTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  researchItem: { fontSize: 10, color: c.textSecondary, marginBottom: 3, lineHeight: 1.4 },

  // ── Conversation body ──
  sectionHeading: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: c.text,
    marginTop: 8,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  message: { marginBottom: 14 },
  messageRole: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: c.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  messageUser: {
    backgroundColor: c.surface,
    borderRadius: 5,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: c.mutedSoft,
  },
  messageAssistant: {
    backgroundColor: c.bg,
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: c.borderSoft,
  },
  messageText: { fontSize: 10, color: c.text, lineHeight: 1.6 },

  // ── Footer ──
  footer: {
    position: 'absolute' as const,
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: c.borderSoft,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: c.muted },
  pageNumber: { fontSize: 7, color: c.muted },
});

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PdfConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface PdfAttachedSearch {
  query: string;
  created_at: string;
}

interface ContentLabConversationPdfProps {
  agency: AgencyBrand;
  clientName: string;
  clientLogoDataUrl: string | null;
  conversationTitle: string | null;
  messages: PdfConversationMessage[];
  attachedSearches: PdfAttachedSearch[];
  /**
   * Pre-rasterized PNG data URLs for every unique mermaid fenced block in
   * the conversation, keyed by `hashMermaidBody(body)`. Built by the export
   * button via `rasterizeMermaidBlocks` so the PDF embeds real diagrams
   * instead of the labeled-source fallback in pdf-markdown.tsx.
   */
  mermaidImages?: Map<string, string>;
  /** Pre-rasterized PNG data URLs for html-visual fenced blocks, same pattern. */
  htmlVisualImages?: Map<string, string>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clientInitialsFor(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (words.length === 0) return '?';
  return words.map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function agencyConfig(brand: AgencyBrand) {
  if (brand === 'anderson') {
    return {
      logo: AC_LOGO_PNG,
      agencyName: 'Anderson Collaborative',
      accent: c.acAccent,
      softBg: c.acSoftBg,
      footerLabel: 'Anderson Collaborative Cortex · Strategy session',
    };
  }
  return {
    logo: NATIVZ_LOGO_ON_LIGHT_PNG,
    agencyName: 'Nativz',
    accent: c.nativzAccent,
    softBg: c.nativzSoftBg,
    footerLabel: 'Nativz Cortex · Strategy session',
  };
}

function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Main document ──────────────────────────────────────────────────────────

export function ContentLabConversationPdf({
  agency,
  clientName,
  clientLogoDataUrl,
  conversationTitle,
  messages,
  attachedSearches,
  mermaidImages,
  htmlVisualImages,
}: ContentLabConversationPdfProps) {
  const config = agencyConfig(agency);
  const dateStr = formatDate(new Date());

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        {/* Agency-coloured brand bar */}
        <View style={[s.brandBar, { backgroundColor: config.accent }]} />

        {/* Header: agency logo left, client identity right */}
        <View style={s.header}>
          <View style={s.logoRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={config.logo} style={s.agencyLogoImg} />
            {clientLogoDataUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={clientLogoDataUrl} style={s.clientLogoImg} />
            ) : (
              <Text style={s.clientInitials}>{clientInitialsFor(clientName)}</Text>
            )}
          </View>

          <View style={s.titleBlock}>
            <Text style={s.kicker}>Strategy session</Text>
            <Text style={s.title}>{conversationTitle || clientName}</Text>
            <Text style={s.subtitle}>
              Research-grounded strategy, video ideas, and scripts produced with {clientName} in the Content Lab.
            </Text>
          </View>

          <View style={s.metaGrid}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Prepared for</Text>
              <Text style={s.metaValue}>{clientName}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Prepared by</Text>
              <Text style={s.metaValue}>{config.agencyName}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{dateStr}</Text>
            </View>
          </View>
        </View>

        {/* Attached research block — only renders when there's something to cite */}
        {attachedSearches.length > 0 && (
          <View
            style={[s.researchCard, { backgroundColor: config.softBg, borderLeftColor: config.accent }]}
            wrap={false}
          >
            <Text style={s.researchTitle}>Research grounding</Text>
            {attachedSearches.map((search, i) => (
              <Text key={i} style={s.researchItem}>
                • {search.query}
                {search.created_at ? ` — ${formatDate(search.created_at)}` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Conversation body */}
        <Text style={s.sectionHeading}>Conversation</Text>

        {messages.length === 0 ? (
          <View style={s.messageAssistant}>
            <Text style={s.messageText}>(No messages in this conversation yet.)</Text>
          </View>
        ) : (
          messages.map((msg) => (
            <View key={msg.id} style={s.message} wrap>
              <Text style={s.messageRole}>
                {msg.role === 'user' ? clientName + ' / You' : 'Cortex — The Nerd'}
              </Text>
              <View style={msg.role === 'user' ? s.messageUser : s.messageAssistant}>
                {msg.role === 'user' ? (
                  // User messages are almost always plain text — render them
                  // as a single Text node so whitespace is preserved literally.
                  <Text style={s.messageText}>{msg.content}</Text>
                ) : (
                  // Assistant output is markdown — run it through the real
                  // tree renderer so headings, bold runs, bullets, and code
                  // blocks come through instead of a flat string.
                  renderMarkdownToPdfBlocks(msg.content, mermaidImages, htmlVisualImages)
                )}
              </View>
            </View>
          ))
        )}

        {/* Footer (fixed, renders on every page) */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {config.footerLabel}
            {conversationTitle ? ` · ${conversationTitle}` : ''}
          </Text>
          <Text
            style={s.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
}
