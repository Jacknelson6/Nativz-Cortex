import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { AC_LOGO_PNG } from '@/lib/brand-logo';
import { NativzLogoPdf } from '@/lib/pdf/nativz-logo-pdf';
import type { DateRange } from '@/lib/types/reporting';
import type { AffiliateKpis, TopAffiliate, PendingPayout } from '@/components/affiliates/hooks/use-affiliates-data';

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
};

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
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: c.accent,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  kpiLabel: { fontSize: 8, color: c.muted, marginBottom: 4, textTransform: 'uppercase' as const },
  kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: c.text },
  kpiSub: { fontSize: 8, color: c.textSecondary, marginTop: 2 },
  // Table
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
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.textSecondary, textTransform: 'uppercase' as const },
  td: { fontSize: 9, color: c.text },
  tdMuted: { fontSize: 9, color: c.muted },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
});

function fmt(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

interface AffiliateReportProps {
  clientName: string;
  agency?: string | null;
  dateRange: DateRange;
  kpis: AffiliateKpis;
  topAffiliates: TopAffiliate[];
  pendingPayouts: PendingPayout[];
  sections: {
    performanceSummary: boolean;
    topAffiliates: boolean;
    pendingPayouts: boolean;
    trendChart: boolean;
  };
}

export function AffiliateReportPdf({
  clientName,
  agency,
  dateRange,
  kpis,
  topAffiliates,
  pendingPayouts,
  sections,
}: AffiliateReportProps) {
  const isAC = agency?.toLowerCase().includes('anderson');

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Brand bar */}
        <View style={[s.brandBar, { backgroundColor: c.accent }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View>
              <Text style={s.title}>Affiliate program report</Text>
              <Text style={s.subtitle}>{clientName}</Text>
              <Text style={s.meta}>
                {dateRange.start} — {dateRange.end}
              </Text>
            </View>
            {isAC ? (
              <Image src={AC_LOGO_PNG} style={{ width: 80, height: 24 }} />
            ) : (
              <NativzLogoPdf width={80} />
            )}
          </View>
        </View>

        {/* Performance Summary */}
        {sections.performanceSummary && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Performance summary</Text>
            <View style={s.kpiRow}>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>New affiliates</Text>
                <Text style={s.kpiValue}>{kpis.newAffiliates}</Text>
                <Text style={s.kpiSub}>{kpis.totalAffiliates} total ({kpis.activeAffiliates} active)</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Referrals</Text>
                <Text style={s.kpiValue}>{kpis.referralsInPeriod}</Text>
              </View>
            </View>
            <View style={s.kpiRow}>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Period revenue</Text>
                <Text style={s.kpiValue}>{fmt(kpis.periodRevenue)}</Text>
                <Text style={s.kpiSub}>{fmt(kpis.totalRevenue)} all-time</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Pending payouts</Text>
                <Text style={[s.kpiValue, { color: c.amber }]}>{fmt(kpis.totalPending)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Top Affiliates */}
        {sections.topAffiliates && topAffiliates.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Top affiliates by revenue</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, { width: '5%' }]}>#</Text>
              <Text style={[s.th, { width: '30%' }]}>Name</Text>
              <Text style={[s.th, { width: '25%' }]}>Email</Text>
              <Text style={[s.th, { width: '12%' }]}>Status</Text>
              <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Revenue</Text>
              <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Pending</Text>
            </View>
            {topAffiliates.slice(0, 10).map((a, i) => (
              <View key={a.uppromote_id} style={s.tableRow}>
                <Text style={[s.tdMuted, { width: '5%' }]}>{i + 1}</Text>
                <Text style={[s.td, { width: '30%', fontFamily: 'Helvetica-Bold' }]}>{a.name}</Text>
                <Text style={[s.tdMuted, { width: '25%' }]}>{a.email}</Text>
                <Text style={[s.td, { width: '12%', color: a.status === 'active' ? c.green : c.muted }]}>{a.status}</Text>
                <Text style={[s.td, { width: '14%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(a.revenue)}</Text>
                <Text style={[s.td, { width: '14%', textAlign: 'right', color: a.pending > 0 ? c.amber : c.muted }]}>
                  {a.pending > 0 ? fmt(a.pending) : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Pending Payouts */}
        {sections.pendingPayouts && pendingPayouts.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Pending payouts</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, { width: '40%' }]}>Affiliate</Text>
              <Text style={[s.th, { width: '30%', textAlign: 'right' }]}>Pending</Text>
              <Text style={[s.th, { width: '30%', textAlign: 'right' }]}>Paid to date</Text>
            </View>
            {pendingPayouts.map((p) => (
              <View key={p.email} style={s.tableRow}>
                <View style={{ width: '40%' }}>
                  <Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>{p.name}</Text>
                  <Text style={[s.tdMuted, { fontSize: 7 }]}>{p.email}</Text>
                </View>
                <Text style={[s.td, { width: '30%', textAlign: 'right', color: c.amber, fontFamily: 'Helvetica-Bold' }]}>
                  {fmt(p.pending)}
                </Text>
                <Text style={[s.tdMuted, { width: '30%', textAlign: 'right' }]}>{fmt(p.paid)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.meta}>Generated by Nativz Cortex</Text>
          <Text style={s.meta} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
