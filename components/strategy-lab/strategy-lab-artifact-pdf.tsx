import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { NATIVZ_LOGO_ON_LIGHT_PNG, AC_LOGO_PNG } from '@/lib/brand-logo';
import type { AgencyBrand } from '@/lib/agency/detect';
import { renderMarkdownToPdfBlocks } from './pdf-markdown';
import type { ArtifactType } from '@/lib/artifacts/types';

// ─── Palette — light, client-facing ─────────────────────────────────────────

const c = {
  bg: '#FFFFFF',
  surface: '#F7F7FA',
  border: '#E4E4EA',
  text: '#0F1117',
  textSecondary: '#3F4252',
  muted: '#6A6A7A',
  nativzAccent: '#046BD2',
  nativzSoftBg: '#EEF6FF',
  acAccent: '#10B981',
  acSoftBg: '#ECF9F3',
};

const TYPE_LABELS: Record<ArtifactType, string> = {
  script: 'Script',
  plan: 'Plan',
  diagram: 'Diagram',
  ideas: 'Video Ideas',
  hook: 'Hooks',
  strategy: 'Content Strategy',
  general: 'Artifact',
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 56,
    backgroundColor: c.bg,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerLeft: {
    flex: 1,
  },
  agencyLogo: {
    width: 80,
    height: 28,
    objectFit: 'contain' as const,
  },
  clientLogo: {
    width: 48,
    height: 48,
    borderRadius: 8,
    objectFit: 'contain' as const,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: c.text,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  metaText: {
    fontSize: 9,
    color: c.muted,
  },
  typeBadge: {
    fontSize: 8,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  content: {
    marginTop: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: c.muted,
  },
});

function agencyConfig(brand: AgencyBrand) {
  if (brand === 'anderson') {
    return {
      logo: AC_LOGO_PNG,
      agencyName: 'Anderson Collaborative',
      accent: c.acAccent,
      softBg: c.acSoftBg,
      footerLabel: 'Anderson Collaborative Cortex',
    };
  }
  return {
    logo: NATIVZ_LOGO_ON_LIGHT_PNG,
    agencyName: 'Nativz',
    accent: c.nativzAccent,
    softBg: c.nativzSoftBg,
    footerLabel: 'Nativz Cortex',
  };
}

function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Main document ──────────────────────────────────────────────────────────

interface ArtifactPdfProps {
  agency: AgencyBrand;
  clientName: string;
  clientLogoDataUrl: string | null;
  title: string;
  content: string;
  artifactType: ArtifactType;
  createdAt: string;
  mermaidImages?: Map<string, string>;
  htmlVisualImages?: Map<string, string>;
}

export function StrategyLabArtifactPdf({
  agency,
  clientName,
  clientLogoDataUrl,
  title,
  content,
  artifactType,
  createdAt,
  mermaidImages,
  htmlVisualImages,
}: ArtifactPdfProps) {
  const config = agencyConfig(agency);
  const typeLabel = TYPE_LABELS[artifactType] ?? 'Artifact';

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={config.logo} style={s.agencyLogo} />
            <Text style={[s.title, { marginTop: 12 }]}>{title}</Text>
            <View style={s.metaRow}>
              <Text
                style={[
                  s.typeBadge,
                  { backgroundColor: config.softBg, color: config.accent },
                ]}
              >
                {typeLabel}
              </Text>
              <Text style={s.metaText}>{clientName}</Text>
              <Text style={s.metaText}>{formatDate(createdAt)}</Text>
            </View>
          </View>
          {clientLogoDataUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={clientLogoDataUrl} style={s.clientLogo} />
          )}
        </View>

        {/* Content */}
        <View style={s.content}>
          {renderMarkdownToPdfBlocks(content, mermaidImages, htmlVisualImages)}
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{config.footerLabel}</Text>
          <Text style={s.footerText}>
            {clientName} — {typeLabel}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
