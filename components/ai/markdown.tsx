'use client';

import React from 'react';

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match links, bold, italic, inline code
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*([^*]+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      // Link
      parts.push(
        <a key={match.index} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      parts.push(<strong key={match.index} className="font-semibold text-text-primary">{match[4]}</strong>);
    } else if (match[5]) {
      parts.push(<em key={match.index} className="italic">{match[5]}</em>);
    } else if (match[6]) {
      parts.push(
        <code key={match.index} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] font-mono text-accent-text">
          {match[6]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? <>{parts}</> : text;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${i}`} className="group relative my-3 overflow-hidden rounded-lg border border-white/[0.06]">
            {codeLang && (
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                <span className="text-[11px] font-medium text-text-muted">{codeLang}</span>
              </div>
            )}
            <pre className="overflow-x-auto bg-black/30 p-3 text-[13px] leading-relaxed font-mono text-gray-300">
              {codeBuffer.join('\n')}
            </pre>
          </div>,
        );
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
      elements.push(<h4 key={i} className="mt-4 mb-1.5 text-sm font-semibold text-text-primary">{formatInline(line.slice(4))}</h4>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="mt-5 mb-1.5 text-[15px] font-semibold text-text-primary">{formatInline(line.slice(3))}</h3>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="mt-5 mb-2 text-base font-bold text-text-primary">{formatInline(line.slice(2))}</h2>);
      return;
    }

    const boldLineMatch = line.match(/^\*\*(.+?)\*\*:?$/);
    if (boldLineMatch) {
      elements.push(<h4 key={i} className="mt-4 mb-1 text-sm font-semibold text-text-primary">{boldLineMatch[1]}</h4>);
      return;
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (bulletMatch) {
      const depth = Math.floor((bulletMatch[1] || '').length / 2);
      elements.push(
        <div key={i} className="flex gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted/60" />
          <span className="text-sm leading-relaxed">{formatInline(bulletMatch[2])}</span>
        </div>,
      );
      return;
    }

    const numberedMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <div key={i} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted/60" />
          <span className="text-sm leading-relaxed">{formatInline(numberedMatch[2])}</span>
        </div>,
      );
      return;
    }

    if (line.startsWith('---')) {
      elements.push(<hr key={i} className="my-4 border-white/[0.06]" />);
      return;
    }

    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    elements.push(<p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>);
  });

  if (inCodeBlock && codeBuffer.length) {
    elements.push(
      <pre key="code-final" className="my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 text-[13px] font-mono text-gray-300">
        {codeBuffer.join('\n')}
      </pre>,
    );
  }

  return <div className="space-y-1">{elements}</div>;
}
