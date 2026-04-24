import { Fragment, type ReactNode } from 'react';

/**
 * Minimal markdown → React nodes. Supports headings (##-####), bold, italic,
 * lists, paragraphs, inline code, and http(s) links. We return React elements
 * directly — safer than rendering to HTML strings on a public, unauthenticated
 * surface like /proposals/[slug].
 */
export function renderMarkdownToNodes(src: string): ReactNode {
  if (!src.trim()) return null;
  const lines = src.split('\n');
  const blocks: ReactNode[] = [];
  let buffer: string[] = [];
  let inUl = false;
  let ulItems: ReactNode[] = [];
  let key = 0;

  const flushPara = () => {
    if (buffer.length === 0) return;
    blocks.push(<p key={`p-${key++}`}>{renderInline(buffer.join(' '))}</p>);
    buffer = [];
  };
  const flushUl = () => {
    if (!inUl) return;
    blocks.push(
      <ul key={`ul-${key++}`}>
        {ulItems.map((n, i) => (
          <li key={`li-${key}-${i}`}>{n}</li>
        ))}
      </ul>,
    );
    inUl = false;
    ulItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushUl();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      flushUl();
      const level = Math.min(h[1].length + 1, 6);
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5';
      blocks.push(<Tag key={`h-${key++}`}>{renderInline(h[2])}</Tag>);
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      inUl = true;
      ulItems.push(renderInline(li[1]));
      continue;
    }
    flushUl();
    buffer.push(line);
  }
  flushPara();
  flushUl();
  return <Fragment>{blocks}</Fragment>;
}

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function renderInline(input: string): ReactNode {
  if (!input) return null;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of input.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(input.slice(last, start));
    const tok = match[0];
    if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(<strong key={`b-${key++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      nodes.push(<em key={`i-${key++}`}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith('`')) {
      nodes.push(<code key={`c-${key++}`}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('[')) {
      const linkMatch = tok.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
      if (linkMatch) {
        nodes.push(
          <a key={`a-${key++}`} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>,
        );
      }
    }
    last = start + tok.length;
  }
  if (last < input.length) nodes.push(input.slice(last));
  return <>{nodes}</>;
}
