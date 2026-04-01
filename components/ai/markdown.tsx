'use client';

import React from 'react';
import { HtmlVisualBlock, MermaidDiagramBlock } from '@/components/ai/rich-code-block';

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
    ? 'rounded bg-white/[0.12] px-1.5 py-0.5 text-[13px] font-mono text-cyan-100'
    : 'rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] font-mono text-accent-text';
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

export function Markdown({ content, variant = 'default' }: { content: string; variant?: MarkdownVariant }) {
  const present = variant === 'present';
  const h2Cls = present ? 'mt-5 mb-2 text-base font-bold text-white' : 'mt-5 mb-2 text-base font-bold text-text-primary';
  const h3Cls = present ? 'mt-5 mb-1.5 text-[15px] font-semibold text-white' : 'mt-5 mb-1.5 text-[15px] font-semibold text-text-primary';
  const h4Cls = present ? 'mt-4 mb-1.5 text-sm font-semibold text-white' : 'mt-4 mb-1.5 text-sm font-semibold text-text-primary';
  const boldLineCls = present ? 'mt-4 mb-1 text-sm font-semibold text-white' : 'mt-4 mb-1 text-sm font-semibold text-text-primary';
  const pCls = present ? 'text-[15px] leading-relaxed text-zinc-200/95' : 'text-sm leading-relaxed';
  const bulletDotCls = present ? 'mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/90' : 'mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted/60';
  const bulletTextCls = present ? 'text-[15px] leading-relaxed text-zinc-200/95' : 'text-sm leading-relaxed';
  const codeMetaCls = present ? 'text-[11px] font-medium text-zinc-400' : 'text-[11px] font-medium text-text-muted';

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';

  lines.forEach((line, i) => {
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
                    ? 'overflow-x-auto bg-black/50 p-3 text-[13px] leading-relaxed font-mono text-zinc-200'
                    : 'overflow-x-auto bg-black/30 p-3 text-[13px] leading-relaxed font-mono text-gray-300'
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

  if (inCodeBlock && codeBuffer.length) {
    const codeBody = codeBuffer.join('\n');
    const langLower = codeLang.toLowerCase();
    const visualVariant = present ? 'present' : 'default';
    if (langLower === 'mermaid') {
      elements.push(<MermaidDiagramBlock key="code-final" code={codeBody} variant={visualVariant} />);
    } else if (langLower === 'html' || langLower === 'html-visual') {
      elements.push(<HtmlVisualBlock key="code-final" code={codeBody} variant={visualVariant} />);
    } else {
      elements.push(
        <pre
          key="code-final"
          className={
            present
              ? 'my-3 overflow-x-auto rounded-lg border border-white/[0.1] bg-black/50 p-3 text-[13px] font-mono text-zinc-200'
              : 'my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 text-[13px] font-mono text-gray-300'
          }
        >
          {codeBody}
        </pre>,
      );
    }
  }

  return <div className={present ? 'space-y-2' : 'space-y-1'}>{elements}</div>;
}
