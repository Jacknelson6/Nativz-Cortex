'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import type { ChatMessage } from '@/components/ai/message';
import type { PdfAttachedSearch } from './content-lab-conversation-pdf';
import { exportConversationPdf } from '@/lib/content-lab/export-conversation-pdf';

interface ContentLabConversationExportButtonProps {
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

export function ContentLabConversationExportButton({
  clientId,
  clientName,
  conversationTitle,
  messages,
  attachedSearches,
  disabled,
  compact,
  ariaLabel,
}: ContentLabConversationExportButtonProps) {
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
      await exportConversationPdf({
        clientId,
        clientName,
        conversationTitle,
        messages,
        attachedSearches,
        agency: brand,
      });
      toast.success('Strategy PDF exported');
    } catch (err) {
      console.error('Content Lab PDF export error:', err);
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
