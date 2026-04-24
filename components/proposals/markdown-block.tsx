'use client';

import ReactMarkdown from 'react-markdown';

/**
 * Safe markdown renderer for public surfaces. react-markdown renders to
 * React nodes (never innerHTML) and does not process raw HTML by default,
 * so admin-authored markdown cannot inject scripts into the signer's page.
 */
export function MarkdownBlock({ source }: { source: string | null | undefined }) {
  if (!source || !source.trim()) return null;
  return <ReactMarkdown>{source}</ReactMarkdown>;
}
