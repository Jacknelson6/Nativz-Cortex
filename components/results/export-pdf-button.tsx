'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { TopicSearch } from '@/lib/types/search';

interface ExportPdfButtonProps {
  search: TopicSearch;
  clientName?: string | null;
  agency?: string | null;
}

export function ExportPdfButton({ search, clientName, agency }: ExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      // Dynamic import to avoid SSR issues
      const { pdf } = await import('@react-pdf/renderer');
      const { SearchPdfDocument } = await import('./search-pdf-document');

      const blob = await pdf(
        SearchPdfDocument({ search, clientName: clientName || undefined, agency })
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${search.query.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf`;
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

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      {exporting ? 'Exporting...' : 'Export PDF'}
    </Button>
  );
}
