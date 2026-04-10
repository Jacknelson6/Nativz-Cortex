'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import type { ChatMessage } from '@/components/ai/message';
import type { PdfAttachedSearch, PdfConversationMessage } from './strategy-lab-conversation-pdf';

interface StrategyLabConversationExportButtonProps {
  clientId: string;
  clientName: string;
  conversationTitle: string | null;
  messages: ChatMessage[];
  attachedSearches: PdfAttachedSearch[];
  disabled?: boolean;
  /**
   * Compact variant — icon-only, smaller padding — intended for the inline
   * "export this reply" button rendered next to each assistant message. The
   * default rendering is the header button used at the top of the chat.
   */
  compact?: boolean;
  /** Aria label override — used in compact mode where there's no text label. */
  ariaLabel?: string;
}

/**
 * Fetch the client's logo URL (from the mentions endpoint, which already
 * returns every active client with `avatarUrl: c.logo_url`) and convert it
 * to a data URL so @react-pdf/renderer can embed it reliably (avoids CORS
 * issues that sometimes bite remote <Image src> during PDF generation in the
 * browser). Returns null if the client has no logo or fetching fails — the
 * PDF falls back to initials.
 */
async function fetchClientLogoDataUrl(clientId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/nerd/mentions');
    if (!res.ok) return null;
    const data = (await res.json()) as {
      clients?: Array<{ id: string; avatarUrl?: string | null }>;
    };
    const match = (data.clients ?? []).find((c) => c.id === clientId);
    const url = match?.avatarUrl;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;

    const logoRes = await fetch(url);
    if (!logoRes.ok) return null;
    const blob = await logoRes.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function StrategyLabConversationExportButton({
  clientId,
  clientName,
  conversationTitle,
  messages,
  attachedSearches,
  disabled,
  compact,
  ariaLabel,
}: StrategyLabConversationExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const { brand } = useAgencyBrand();

  async function handleExport() {
    if (exporting) return;
    if (messages.length === 0) {
      toast.message('Start a conversation first, then export');
      return;
    }
    setExporting(true);
    try {
      // Fetch the client logo in parallel with loading the PDF renderer.
      const [clientLogoDataUrl, rendererModule, docModule] = await Promise.all([
        fetchClientLogoDataUrl(clientId),
        import('@react-pdf/renderer'),
        import('./strategy-lab-conversation-pdf'),
      ]);
      const { pdf } = rendererModule;
      const { StrategyLabConversationPdf } = docModule;

      // Only ship user + assistant messages to the PDF. Tool role messages are
      // internal plumbing and don't add value in a client-facing deliverable.
      const pdfMessages: PdfConversationMessage[] = messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
          m.role === 'user' || m.role === 'assistant',
        )
        .map((m) => ({ id: m.id, role: m.role, content: m.content }));

      const blob = await pdf(
        StrategyLabConversationPdf({
          agency: brand,
          clientName,
          clientLogoDataUrl,
          conversationTitle,
          messages: pdfMessages,
          attachedSearches,
        }),
      ).toBlob();

      const safeName = clientName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'strategy';
      const datePart = new Date().toISOString().slice(0, 10);
      const filename = `${safeName}_strategy_${datePart}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Strategy PDF exported');
    } catch (err) {
      console.error('Strategy Lab PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled || exporting}
        aria-label={ariaLabel ?? 'Export this reply as PDF'}
        title={ariaLabel ?? 'Export this reply as PDF'}
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted/70 transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {exporting ? (
          <Loader2 size={11} className="animate-spin" aria-hidden />
        ) : (
          <FileDown size={11} aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || exporting}
      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-nativz-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent/20 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
      {exporting ? 'Exporting…' : 'Export PDF'}
    </button>
  );
}
