'use client';

import { useState } from 'react';
import { FileDown, Loader2, Link2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { DateRange } from '@/lib/types/reporting';
import type { AffiliateKpis, TopAffiliate, PendingPayout, SnapshotPoint } from './hooks/use-affiliates-data';

interface AffiliateReportSections {
  performanceSummary: boolean;
  topAffiliates: boolean;
  pendingPayouts: boolean;
  trendChart: boolean;
}

interface AffiliateReportBuilderProps {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId: string;
  agency?: string | null;
  logoUrl?: string | null;
  dateRange: DateRange;
  kpis: AffiliateKpis;
  topAffiliates: TopAffiliate[];
  pendingPayouts: PendingPayout[];
  snapshots: SnapshotPoint[];
}

export function AffiliateReportBuilder({
  open,
  onClose,
  clientName,
  clientId,
  agency,
  dateRange,
  kpis,
  topAffiliates,
  pendingPayouts,
}: AffiliateReportBuilderProps) {
  const [sections, setSections] = useState<AffiliateReportSections>({
    performanceSummary: true,
    topAffiliates: true,
    pendingPayouts: true,
    trendChart: true,
  });
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  function toggleSection(key: keyof AffiliateReportSections) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleDownload() {
    setExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { AffiliateReportPdf } = await import('@/lib/pdf/affiliate-report-template');

      const rawBlob = await pdf(
        AffiliateReportPdf({
          clientName,
          agency,
          dateRange,
          kpis,
          topAffiliates: sections.topAffiliates ? topAffiliates : [],
          pendingPayouts: sections.pendingPayouts ? pendingPayouts : [],
          sections,
        }),
      ).toBlob();

      // Ensure the blob has the correct PDF MIME type
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_affiliate_report_${dateRange.start}_${dateRange.end}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF exported');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }

  async function handleShare() {
    setSharing(true);
    try {
      const res = await fetch('/api/reporting/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          dateRange,
          reportType: 'affiliate',
          sections,
        }),
      });

      if (!res.ok) throw new Error('Failed to create share link');
      const data = await res.json();
      await navigator.clipboard.writeText(data.url);
      toast.success('Share link copied to clipboard');
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Download affiliate report" maxWidth="lg">
      <div className="space-y-6">
        {/* Date range display */}
        <div className="rounded-lg bg-surface-hover/50 px-4 py-3">
          <p className="text-xs text-text-muted mb-0.5">Date range</p>
          <p className="text-sm text-text-primary font-medium">
            {dateRange.start} — {dateRange.end}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Reporting for <span className="text-text-secondary">{clientName}</span>
          </p>
        </div>

        {/* Section toggles */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Sections</h3>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sections.performanceSummary}
              onChange={() => toggleSection('performanceSummary')}
              className="accent-accent-text h-4 w-4"
            />
            <div>
              <p className="text-sm text-text-primary">Performance summary</p>
              <p className="text-xs text-text-muted">
                New affiliates, referrals, revenue, and pending payouts
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sections.topAffiliates}
              onChange={() => toggleSection('topAffiliates')}
              className="accent-accent-text h-4 w-4"
            />
            <div>
              <p className="text-sm text-text-primary">Top affiliates</p>
              <p className="text-xs text-text-muted">
                Ranked list of best-performing affiliates by revenue
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sections.pendingPayouts}
              onChange={() => toggleSection('pendingPayouts')}
              className="accent-accent-text h-4 w-4"
            />
            <div>
              <p className="text-sm text-text-primary">Pending payouts</p>
              <p className="text-xs text-text-muted">
                Affiliates with outstanding payment balances
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sections.trendChart}
              onChange={() => toggleSection('trendChart')}
              className="accent-accent-text h-4 w-4"
            />
            <div>
              <p className="text-sm text-text-primary">Trend data</p>
              <p className="text-xs text-text-muted">
                Daily snapshot data for the selected period
              </p>
            </div>
          </label>
        </div>

        {/* Preview of KPIs */}
        <div className="rounded-lg bg-surface-hover/30 px-4 py-3">
          <p className="text-xs text-text-muted mb-2">Preview</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-text-muted text-xs">New affiliates</p>
              <p className="text-text-primary font-medium">{kpis.newAffiliates}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Referrals</p>
              <p className="text-text-primary font-medium">{kpis.referralsInPeriod}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Period revenue</p>
              <p className="text-text-primary font-medium">${kpis.periodRevenue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Total revenue</p>
              <p className="text-text-primary font-medium">${kpis.totalRevenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-nativz-border">
          <Button onClick={handleDownload} disabled={exporting}>
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            {exporting ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button
            variant="outline"
            onClick={handleShare}
            disabled={sharing}
          >
            {sharing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Link2 size={14} />
            )}
            {sharing ? 'Creating...' : 'Share link'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
