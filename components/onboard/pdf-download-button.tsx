'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ClientStrategy } from '@/lib/types/strategy';

// Lazy-load @react-pdf/renderer + the PDF document — both ship ~500KB+ of JS
// that's only needed when the user clicks "Download PDF". Eager imports
// would ship the entire PDF engine with the onboard bundle, regressing TTI
// on the client portal for every user including the many who never download.

interface PdfDownloadButtonProps {
  strategy: ClientStrategy;
  clientName: string;
}

export function PdfDownloadButton({ strategy, clientName }: PdfDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  async function handleDownload() {
    setGenerating(true);
    try {
      const [{ pdf }, { StrategyPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./strategy-pdf'),
      ]);
      const blob = await pdf(
        <StrategyPdf strategy={strategy} clientName={clientName} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-content-strategy.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('PDF generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={generating}>
      {generating ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      {generating ? 'Generating PDF...' : 'Download PDF'}
    </Button>
  );
}
