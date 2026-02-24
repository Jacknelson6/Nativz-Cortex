import React from 'react';
import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a2e',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#6366f1',
    paddingBottom: 16,
  },
  brandName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#6366f1',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a2e',
    marginTop: 16,
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  metaItem: {
    fontSize: 9,
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#6366f1',
    marginTop: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 4,
  },
  body: {
    fontSize: 10,
    lineHeight: 1.6,
    color: '#374151',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
  link: {
    fontSize: 9,
    color: '#6366f1',
  },
});

interface BriefPDFProps {
  title: string;
  url: string;
  thumbnailUrl: string | null;
  briefContent: string;
  clientName: string | null;
  platform: string;
  generatedAt: string;
}

export function BriefPDFDocument(props: BriefPDFProps) {
  const { title, url, briefContent, clientName, platform, generatedAt } = props;

  // Parse markdown sections from the brief
  const sections = parseBriefSections(briefContent);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandName}>Nativz</Text>
          <Text style={styles.subtitle}>Video Replication Brief</Text>
        </View>

        {/* Video info */}
        <Text style={styles.title}>{title}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaItem}>Platform: {platform.charAt(0).toUpperCase() + platform.slice(1)}</Text>
          {clientName && <Text style={styles.metaItem}>Client: {clientName}</Text>}
          <Text style={styles.metaItem}>Generated: {new Date(generatedAt).toLocaleDateString()}</Text>
        </View>
        <Link src={url} style={styles.link}>{url}</Link>

        {/* Brief sections */}
        {sections.map((section, i) => (
          <View key={i} wrap={false}>
            {section.heading && <Text style={styles.sectionTitle}>{section.heading}</Text>}
            <Text style={styles.body}>{section.content}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Nativz Cortex — Confidential</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function parseBriefSections(content: string): Array<{ heading: string | null; content: string }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string | null; content: string }> = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0 || currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0 || currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
  }

  return sections.filter(s => s.content.length > 0 || s.heading);
}
