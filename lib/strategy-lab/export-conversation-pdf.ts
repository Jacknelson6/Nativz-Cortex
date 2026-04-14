import type { ChatMessage } from '@/components/ai/message';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { PdfAttachedSearch, PdfConversationMessage } from '@/components/strategy-lab/strategy-lab-conversation-pdf';

/**
 * Shared PDF export logic for the Strategy Lab / Content Lab conversation.
 * Used by the manual export button and the auto-export heuristic — keeps
 * both paths identical so a "video ideas" auto-fire produces the same
 * branded PDF the user would get by clicking the button themselves.
 */

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function fetchLogoAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  try {
    const logoRes = await fetch(url);
    if (!logoRes.ok) return null;
    const blob = await logoRes.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function fetchClientLogoDataUrl(clientId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/nerd/mentions');
    if (res.ok) {
      const data = (await res.json()) as {
        clients?: Array<{ id: string; avatarUrl?: string | null }>;
      };
      const match = (data.clients ?? []).find((c) => c.id === clientId);
      const dataUrl = await fetchLogoAsDataUrl(match?.avatarUrl);
      if (dataUrl) return dataUrl;
    }
    const clientRes = await fetch(`/api/clients/${clientId}`);
    if (clientRes.ok) {
      const client = (await clientRes.json()) as { logo_url?: string | null };
      return await fetchLogoAsDataUrl(client.logo_url);
    }
    return null;
  } catch {
    return null;
  }
}

export interface ExportConversationPdfOpts {
  clientId: string;
  clientName: string;
  conversationTitle: string | null;
  messages: ChatMessage[];
  attachedSearches: PdfAttachedSearch[];
  agency: AgencyBrand;
  /** Override the default filename slug. */
  filenameSuffix?: string;
}

export async function exportConversationPdf(opts: ExportConversationPdfOpts): Promise<void> {
  const {
    clientId,
    clientName,
    conversationTitle,
    messages,
    attachedSearches,
    agency,
    filenameSuffix = 'strategy',
  } = opts;

  if (messages.length === 0) return;

  const [clientLogoDataUrl, rendererModule, docModule, rasterizerModule, htmlVisualModule] =
    await Promise.all([
      fetchClientLogoDataUrl(clientId),
      import('@react-pdf/renderer'),
      import('@/components/strategy-lab/strategy-lab-conversation-pdf'),
      import('@/lib/strategy-lab/rasterize-mermaid'),
      import('@/lib/strategy-lab/rasterize-html-visual'),
    ]);
  const { pdf } = rendererModule;
  const { StrategyLabConversationPdf } = docModule;
  const { rasterizeMermaidBlocks } = rasterizerModule;
  const { rasterizeHtmlVisualBlocks } = htmlVisualModule;

  const pdfMessages: PdfConversationMessage[] = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant',
    )
    .map((m) => ({ id: m.id, role: m.role, content: m.content }));

  const assistantContents = pdfMessages
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content);

  const [mermaidImages, htmlVisualImages] = await Promise.all([
    rasterizeMermaidBlocks(assistantContents),
    rasterizeHtmlVisualBlocks(assistantContents),
  ]);

  const blob = await pdf(
    StrategyLabConversationPdf({
      agency,
      clientName,
      clientLogoDataUrl,
      conversationTitle,
      messages: pdfMessages,
      attachedSearches,
      mermaidImages,
      htmlVisualImages,
    }),
  ).toBlob();

  const safeName = clientName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'strategy';
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_${filenameSuffix}_${datePart}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Heuristic check — does this assistant message look like a "video ideas"
 * deliverable worth auto-exporting? Deliberately strict so we don't
 * inadvertently export every chat response; the user can still hit the
 * manual Export PDF button for anything that fails the heuristic.
 *
 * Triggers when the message:
 *   (a) mentions "video ideas" or "video idea" (case-insensitive), AND
 *   (b) contains at least 5 numbered-list items
 */
export function looksLikeVideoIdeasResponse(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  const lower = content.toLowerCase();
  if (!lower.includes('video idea')) return false;
  // Count top-level numbered list items: `1.` through `99.` at line starts.
  const numberedItems = content.match(/^\s*\d{1,2}[.)]\s+/gm);
  return (numberedItems?.length ?? 0) >= 5;
}
