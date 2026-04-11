'use client';

import React from 'react';
import { HtmlVisualBlock, MermaidDiagramBlock } from '@/components/ai/rich-code-block';
import { cn } from '@/lib/utils/cn';

/** `present` = full-screen dark presenter (high contrast). `default` = in-app surfaces. */
export type MarkdownVariant = 'default' | 'present';

function formatInline(text: string, variant: MarkdownVariant = 'default'): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const isPresent = variant === 'present';
  const linkClass = isPresent
    ? 'font-medium text-sky-300 underline decoration-sky-300/50 underline-offset-[3px] transition-colors hover:text-white hover:decoration-white/60'
    : 'text-accent-text hover:underline';
  const strongClass = isPresent ? 'font-semibold text-white' : 'font-semibold text-text-primary';
  const codeClass = isPresent
    ? 'rounded bg-white/[0.12] px-1.5 py-0.5 text-xs font-mono text-cyan-100'
    : 'rounded bg-white/[0.06] px-1.5 py-0.5 text-xs font-mono text-accent-text';
  const emClass = isPresent ? 'italic text-zinc-200' : 'italic';

  // Match links, bold, italic, inline code
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*([^*]+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      parts.push(
        <a key={match.index} href={match[3]} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      parts.push(<strong key={match.index} className={strongClass}>{match[4]}</strong>);
    } else if (match[5]) {
      parts.push(<em key={match.index} className={emClass}>{match[5]}</em>);
    } else if (match[6]) {
      parts.push(
        <code key={match.index} className={codeClass}>
          {match[6]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? <>{parts}</> : text;
}

export function Markdown({
  content,
  variant = 'default',
  bodySize = 'sm',
}: {
  content: string;
  variant?: MarkdownVariant;
  /** `md` = larger body copy for reports and long-form summaries (default `sm` for chat/dense UI). */
  bodySize?: 'sm' | 'md';
}) {
  const present = variant === 'present';
  const large = !present && bodySize === 'md';
  const h2Cls = present
    ? 'mt-5 mb-2 text-base font-bold text-white'
    : large
      ? 'mt-5 mb-2 text-lg font-bold text-text-primary'
      : 'mt-5 mb-2 text-base font-bold text-text-primary';
  const h3Cls = present
    ? 'mt-5 mb-1.5 text-sm font-semibold text-white'
    : large
      ? 'mt-5 mb-1.5 text-base font-semibold text-text-primary'
      : 'mt-5 mb-1.5 text-sm font-semibold text-text-primary';
  const h4Cls = present
    ? 'mt-4 mb-1.5 text-sm font-semibold text-white'
    : large
      ? 'mt-4 mb-1.5 text-base font-semibold text-text-primary'
      : 'mt-4 mb-1.5 text-sm font-semibold text-text-primary';
  const boldLineCls = present
    ? 'mt-4 mb-1 text-sm font-semibold text-white'
    : large
      ? 'mt-4 mb-1 text-base font-semibold text-text-primary'
      : 'mt-4 mb-1 text-sm font-semibold text-text-primary';
  const pCls = present
    ? 'text-sm leading-relaxed text-zinc-200/95'
    : large
      ? 'text-base leading-relaxed text-text-primary'
      : 'text-sm leading-relaxed';
  const bulletDotCls = present
    ? 'mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/90'
    : large
      ? 'mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted/60'
      : 'mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted/60';
  const bulletTextCls = present
    ? 'text-sm leading-relaxed text-zinc-200/95'
    : large
      ? 'text-base leading-relaxed text-text-primary'
      : 'text-sm leading-relaxed';
  const codeMetaCls = present ? 'text-xs font-medium text-zinc-400' : 'text-xs font-medium text-text-muted';

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';

  // ─── GFM table accumulator ────────────────────────────────────────────
  // Tables are detected with a one-line lookahead: a pipe-delimited line
  // followed by a divider line like "|---|---|" starts a table. Contiguous
  // pipe-delimited rows are buffered; the first non-table line flushes.
  type TableBuffer = { header: string[]; rows: string[][] };
  let tableBuffer: TableBuffer | null = null;

  // Table styling — keep it dense so narrow chat columns stay usable.
  const tableWrapCls = present
    ? 'my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30'
    : 'my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02]';
  const tableCls = 'w-full border-collapse text-left';
  const thCls = present
    ? 'border-b border-white/[0.1] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-300'
    : 'border-b border-white/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted';
  const tdCls = present
    ? 'border-t border-white/[0.05] px-3 py-2 align-top text-sm text-zinc-200/95'
    : 'border-t border-white/[0.05] px-3 py-2 align-top text-sm text-text-secondary';

  function splitTableRow(raw: string): string[] {
    // Strip leading/trailing pipes, then split on unescaped pipes. Cells
    // that look empty are kept so alignment matches the header width.
    const trimmed = raw.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.trim());
  }

  function isTableDivider(raw: string): boolean {
    // |---|---| or | :--- | :---: | ---: | etc. At least one cell must
    // be a run of dashes with optional colons.
    const trimmed = raw.trim();
    if (!/^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(trimmed)) {
      return false;
    }
    return true;
  }

  function isTableRow(raw: string): boolean {
    const trimmed = raw.trim();
    // Pipe somewhere inside and not the divider pattern. Require at least
    // one internal pipe so a lone "| pipe" in a sentence doesn't trigger.
    return /\|/.test(trimmed) && trimmed.length > 1 && trimmed.includes('|', trimmed.indexOf('|') + 1);
  }

  function flushTable(key: string | number) {
    if (!tableBuffer) return;
    const { header, rows } = tableBuffer;
    elements.push(
      <div key={`tbl-${key}`} className={tableWrapCls}>
        <table className={tableCls}>
          <thead>
            <tr>
              {header.map((h, hi) => (
                <th key={hi} className={thCls}>
                  {formatInline(h, variant)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {header.map((_, ci) => (
                  <td key={ci} className={tdCls}>
                    {formatInline(row[ci] ?? '', variant)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableBuffer = null;
  }

  lines.forEach((line, i) => {
    // A live table buffer has right-of-way:
    // 1. Eat the opening divider row (header already consumed, rows empty).
    // 2. Continue collecting data rows (row that isn't a divider).
    // 3. Anything else flushes the table and falls through to normal handling.
    if (tableBuffer && !inCodeBlock) {
      if (isTableDivider(line) && tableBuffer.rows.length === 0) {
        return;
      }
      if (isTableRow(line) && !isTableDivider(line)) {
        tableBuffer.rows.push(splitTableRow(line));
        return;
      }
      flushTable(i);
      // fall through to normal handling for the current line
    }

    // Table start detection: current line is a row AND next line is a divider.
    if (
      !inCodeBlock &&
      !tableBuffer &&
      isTableRow(line) &&
      !isTableDivider(line) &&
      i + 1 < lines.length &&
      isTableDivider(lines[i + 1])
    ) {
      tableBuffer = { header: splitTableRow(line), rows: [] };
      return;
    }

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const codeBody = codeBuffer.join('\n');
        const langLower = codeLang.toLowerCase();
        const visualVariant = present ? 'present' : 'default';

        if (langLower === 'mermaid') {
          elements.push(
            <MermaidDiagramBlock key={`code-${i}`} code={codeBody} variant={visualVariant} />,
          );
        } else if (langLower === 'html' || langLower === 'html-visual') {
          elements.push(
            <HtmlVisualBlock key={`code-${i}`} code={codeBody} variant={visualVariant} />,
          );
        } else {
          elements.push(
            <div key={`code-${i}`} className="group relative my-3 overflow-hidden rounded-lg border border-white/[0.06]">
              {codeLang && (
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                  <span className={codeMetaCls}>{codeLang}</span>
                </div>
              )}
              <pre
                className={
                  present
                    ? 'overflow-x-auto bg-black/50 p-3 text-xs leading-relaxed font-mono text-zinc-200'
                    : 'overflow-x-auto bg-black/30 p-3 text-xs leading-relaxed font-mono text-gray-300'
                }
              >
                {codeBody}
              </pre>
            </div>,
          );
        }
        codeBuffer = [];
        codeLang = '';
      } else {
        codeLang = line.slice(3).trim();
      }
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) { codeBuffer.push(line); return; }

    if (/^\s*<!--[\s\S]*?-->\s*$/.test(line)) {
      return;
    }

    const imgLine = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgLine) {
      elements.push(
        <div key={i} className="my-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgLine[2]}
            alt={imgLine[1]?.trim() || ''}
            className="max-h-44 max-w-full rounded-lg border border-white/[0.06] object-contain"
            loading="lazy"
          />
        </div>,
      );
      return;
    }

    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className={h4Cls}>{formatInline(line.slice(4), variant)}</h4>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className={h3Cls}>{formatInline(line.slice(3), variant)}</h3>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className={h2Cls}>{formatInline(line.slice(2), variant)}</h2>);
      return;
    }

    const boldLineMatch = line.match(/^\*\*(.+?)\*\*:?$/);
    if (boldLineMatch) {
      elements.push(<h4 key={i} className={boldLineCls}>{formatInline(boldLineMatch[1], variant)}</h4>);
      return;
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (bulletMatch) {
      const depth = Math.floor((bulletMatch[1] || '').length / 2);
      elements.push(
        <div key={i} className="flex gap-3" style={{ paddingLeft: `${depth * 16}px` }}>
          <span className={bulletDotCls} />
          <span className={bulletTextCls}>{formatInline(bulletMatch[2], variant)}</span>
        </div>,
      );
      return;
    }

    const numberedMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <div key={i} className="flex gap-3">
          <span className={bulletDotCls} />
          <span className={bulletTextCls}>{formatInline(numberedMatch[2], variant)}</span>
        </div>,
      );
      return;
    }

    if (line.startsWith('---')) {
      elements.push(
        <hr key={i} className={present ? 'my-5 border-white/[0.12]' : 'my-4 border-white/[0.06]'} />,
      );
      return;
    }

    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    elements.push(<p key={i} className={pCls}>{formatInline(line, variant)}</p>);
  });

  // Flush any trailing table that hit end-of-content without a divider below.
  if (tableBuffer) {
    flushTable('final');
  }

  if (inCodeBlock && codeBuffer.length) {
    const codeBody = codeBuffer.join('\n');
    const langLower = codeLang.toLowerCase();

    // An unclosed fenced block means the closing ``` hasn't streamed in yet.
    // Rendering MermaidDiagramBlock / HtmlVisualBlock on a partial body
    // triggers a "syntax error" flash (mermaid) or a broken iframe
    // (html-visual) every time a chunk arrives. Show a neutral skeleton
    // instead — once the closing fence lands on the next chunk, the
    // inline path takes over with the complete code.
    if (langLower === 'mermaid' || langLower === 'html' || langLower === 'html-visual') {
      elements.push(
        <div
          key="code-final"
          className={cn(
            'my-3 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-4 py-4 text-xs text-text-muted',
            present && 'bg-black/45',
          )}
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span>
            Rendering {langLower === 'mermaid' ? 'diagram' : 'visual'}…
          </span>
        </div>,
      );
    } else {
      elements.push(
        <pre
          key="code-final"
          className={
            present
              ? 'my-3 overflow-x-auto rounded-lg border border-white/[0.1] bg-black/50 p-3 text-xs font-mono text-zinc-200'
              : 'my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 text-xs font-mono text-gray-300'
          }
        >
          {codeBody}
        </pre>,
      );
    }
  }

  return <div className={present ? 'space-y-2' : 'space-y-1'}>{elements}</div>;
}
