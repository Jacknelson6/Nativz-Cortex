/**
 * Client-side attachment processing for the ChatComposer.
 *
 * - PDFs: extract text via pdfjs-dist (browser-compatible)
 * - Images: read as base64 data URLs via FileReader
 * - Text files: read as UTF-8 text via FileReader
 *
 * Returns an array of processed attachments ready to send to the Nerd API.
 */

import type { ChatAttachment } from '@/components/ai/chat-composer';

export interface ProcessedAttachment {
  type: 'pdf_text' | 'image' | 'text';
  name: string;
  content: string;
}

/** Read a file as an ArrayBuffer. */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/** Read a file as a UTF-8 string. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

/** Read a file as a base64 data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Extract all text from a PDF file using pdfjs-dist. */
async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');

  // Set up worker — use the bundled worker from pdfjs-dist
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }

  const buffer = await readAsArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    if (pageText.trim()) {
      pages.push(`[Page ${i}]\n${pageText.trim()}`);
    }
  }

  return pages.join('\n\n');
}

/**
 * Process a list of ChatAttachments into API-ready payloads.
 *
 * - PDF files → extract text
 * - Image files → base64 data URL
 * - Text/CSV/Markdown → read as text
 * - Research/knowledge/moodboard refs → pass through with refId as content
 *
 * Failures per-file are logged and skipped — the rest still send.
 */
export async function processAttachments(
  attachments: ChatAttachment[],
): Promise<ProcessedAttachment[]> {
  const results: ProcessedAttachment[] = [];

  for (const att of attachments) {
    try {
      if (att.type === 'file' && att.file) {
        const mime = att.mimeType ?? att.file.type ?? '';

        if (mime === 'application/pdf') {
          const text = await extractPdfText(att.file);
          if (text.trim()) {
            results.push({ type: 'pdf_text', name: att.name, content: text });
          }
        } else if (mime.startsWith('image/')) {
          const dataUrl = await readAsDataUrl(att.file);
          results.push({ type: 'image', name: att.name, content: dataUrl });
        } else {
          // Treat as plain text
          const text = await readAsText(att.file);
          if (text.trim()) {
            results.push({ type: 'text', name: att.name, content: text });
          }
        }
      } else if (att.type === 'research' && att.refId) {
        // Research context is already handled via searchContext — include as a label
        results.push({
          type: 'text',
          name: `Research: ${att.name}`,
          content: `[Attached research search: ${att.name} (ID: ${att.refId})]`,
        });
      } else if (att.type === 'knowledge' && att.refId) {
        results.push({
          type: 'text',
          name: `Knowledge: ${att.name}`,
          content: `[Attached knowledge entry: ${att.name} (ID: ${att.refId})]`,
        });
      } else if (att.type === 'moodboard' && att.refId) {
        results.push({
          type: 'text',
          name: `Moodboard: ${att.name}`,
          content: `[Attached moodboard: ${att.name} (ID: ${att.refId})]`,
        });
      }
    } catch (err) {
      console.warn(`[process-attachments] Failed to process ${att.name}:`, err);
    }
  }

  return results;
}
