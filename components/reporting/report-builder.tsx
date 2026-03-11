'use client';

import { useState } from 'react';
import { FileDown, Loader2, Link2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { SummaryReport, TopPostItem, DateRange } from '@/lib/types/reporting';
import type { ReportSections } from '@/lib/pdf/report-template';

const topPostsCountOptions = [3, 5, 10] as const;

interface ReportBuilderProps {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId: string;
  agency?: string | null;
  logoUrl?: string | null;
  dateRange: DateRange;
  summary: SummaryReport | null;
  fetchTopPostsForReport: (limit: number) => Promise<TopPostItem[]>;
}

export function ReportBuilder({
  open,
  onClose,
  clientName,
  clientId,
  agency,
  logoUrl,
  dateRange,
  summary,
  fetchTopPostsForReport,
}: ReportBuilderProps) {
  const [sections, setSections] = useState<ReportSections>({
    performanceSummary: true,
    platformBreakdown: true,
    topPosts: true,
    topPostsCount: 5,
  });
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  function toggleSection(key: keyof Omit<ReportSections, 'topPostsCount'>) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleDownload() {
    setExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { ReportPdfDocument } = await import('@/lib/pdf/report-template');

      const topPosts = sections.topPosts
        ? await fetchTopPostsForReport(sections.topPostsCount)
        : [];

      const blob = await pdf(
        ReportPdfDocument({
          clientName,
          agency,
          logoUrl,
          dateRange,
          summary,
          topPosts,
          sections,
        }),
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_report_${dateRange.start}_${dateRange.end}.pdf`;
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
    <Dialog open={open} onClose={onClose} title="Download report" maxWidth="lg">
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
                Views, followers, engagement, and rate with period-over-period
                change
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sections.platformBreakdown}
              onChange={() => toggleSection('platformBreakdown')}
              className="accent-accent-text h-4 w-4"
            />
            <div>
              <p className="text-sm text-text-primary">Platform breakdown</p>
              <p className="text-xs text-text-muted">
                Per-platform metrics table
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sections.topPosts}
              onChange={() => toggleSection('topPosts')}
              className="accent-accent-text h-4 w-4"
            />
            <div>
              <p className="text-sm text-text-primary">Top posts</p>
              <p className="text-xs text-text-muted">
                Ranked list of best-performing posts with metrics
              </p>
            </div>
          </label>

          {sections.topPosts && (
            <div className="ml-7 flex items-center gap-2">
              <span className="text-xs text-text-muted">Show top</span>
              <div className="inline-flex rounded-lg bg-surface-hover/50 p-0.5">
                {topPostsCountOptions.map((n) => (
                  <button
                    key={n}
                    onClick={() =>
                      setSections((prev) => ({ ...prev, topPostsCount: n }))
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      sections.topPostsCount === n
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
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
