'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PlatformReport, CompetitorProfile, AuditScorecard, WebsiteContext } from '@/lib/audit/types';

interface AuditExportPdfButtonProps {
  websiteContext: WebsiteContext | null;
  platforms: PlatformReport[];
  competitors: CompetitorProfile[];
  scorecard: AuditScorecard | null;
  agency?: string | null;
}

export function AuditExportPdfButton({
  websiteContext,
  platforms,
  competitors,
  scorecard,
  agency,
}: AuditExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { AuditPdfDocument } = await import('./audit-pdf-document');

      const blob = await pdf(
        AuditPdfDocument({ websiteContext, platforms, competitors, scorecard, agency })
      ).toBlob();

      const filename = websiteContext?.title
        ? `${websiteContext.title.replace(/[^a-zA-Z0-9]/g, '_')}_audit.pdf`
        : 'social_audit.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF exported');
    } catch (err) {
      console.error('Audit PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      {exporting ? 'Exporting...' : 'Export PDF'}
    </Button>
  );
}
