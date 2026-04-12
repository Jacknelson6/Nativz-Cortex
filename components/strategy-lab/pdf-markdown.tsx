import type { JSX } from 'react';
import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { hashMermaidBody } from '@/lib/strategy-lab/rasterize-mermaid';
import { hashHtmlVisualBody } from '@/lib/strategy-lab/rasterize-html-visual';

/**
 * Lightweight markdown → @react-pdf/renderer node converter.
 *
 * Intentionally a narrow subset — react-pdf's type system is rigid and we
 * only need what the Nerd actually outputs: headings, paragraphs, bold /
 * italic inline runs, inline code, fenced code blocks, and bullet + numbered
 * lists. Anything more ambitious (nested lists, tables, blockquotes with
 * complex inline runs) would be better served by a real MDX pipeline.
 *
 * Design notes:
 * - We parse the content line-by-line into a small Block AST, then render
 *   each block into a View/Text tree. This keeps the parser trivially
 *   debuggable and avoids pulling in a full markdown library just to print
 *   three bullet styles.
 * - Inline formatting (bold / italic / code) is handled per-line with a
 *   tokenizer that respects the order of delimiters, so `**bold _inner_**`
 *   produces nested runs.
 * - Everything is black-on-light — matches the light palette in
 *   strategy-lab-conversation-pdf.tsx. Callers pass their own colour only
 *   via the outer <View> if they need a different background.
 */

const m = StyleSheet.create({
  paragraph: {
    fontSize: 10,
    color: '#0F1117',
    lineHeight: 1.6,
    marginBottom: 6,
  },
  heading1: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#0F1117',
    marginTop: 8,
    marginBottom: 6,
  },
  heading2: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0F1117',
    marginTop: 8,
    marginBottom: 5,
  },
  heading3: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0F1117',
    marginTop: 6,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 2,
  },
  listMarker: {
    width: 14,
    fontSize: 10,
    color: '#3F4252',
    lineHeight: 1.6,
  },
  listItemText: {
    flex: 1,
    fontSize: 10,
    color: '#0F1117',
    lineHeight: 1.6,
  },
  codeBlock: {
    backgroundColor: '#F7F7FA',
    borderLeftWidth: 3,
    borderLeftColor: '#E4E4EA',
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
    marginTop: 2,
  },
  mermaidImage: {
    marginTop: 6,
    marginBottom: 10,
    // Width capped by the page column via the outer <View>; @react-pdf
    // respects the intrinsic aspect ratio when only one dimension is set.
    alignSelf: 'center',
    maxWidth: '100%',
    maxHeight: 360,
    objectFit: 'contain',
  },
  codeBlockLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6A6A7A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  codeBlockText: {
    fontSize: 9,
    fontFamily: 'Courier',
    color: '#3F4252',
    lineHeight: 1.5,
  },
  inlineCode: {
    fontFamily: 'Courier',
    fontSize: 9,
    backgroundColor: '#F0F0F5',
    color: '#3F4252',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  italic: {
    fontFamily: 'Helvetica-Oblique',
  },
  boldItalic: {
    fontFamily: 'Helvetica-BoldOblique',
  },
});

// ─── Block AST ────────────────────────────────────────────────────────────

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; items: string[] }
  | { kind: 'numbered'; items: string[] }
  | { kind: 'code'; text: string; lang?: string };

function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (/^```/.test(trimmed)) {
      const openMatch = trimmed.match(/^```\s*(\S+)?/);
      const lang = openMatch?.[1]?.toLowerCase();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      // consume closing fence if present
      if (i < lines.length) i += 1;
      blocks.push({ kind: 'code', text: codeLines.join('\n'), lang });
      continue;
    }

    // Blank line = paragraph separator
    if (trimmed === '') {
      i += 1;
      continue;
    }

    // Headings (#, ##, ###)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    // Bullet list — collect contiguous items
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'bullet', items });
      continue;
    }

    // Numbered list — collect contiguous items
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'numbered', items });
      continue;
    }

    // Otherwise — paragraph. Accumulate consecutive non-blank, non-special lines.
    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      const nextTrimmed = next.trim();
      if (nextTrimmed === '') break;
      if (/^(#{1,3}\s|```|[-*+]\s|\d+\.\s)/.test(nextTrimmed)) break;
      paragraphLines.push(next);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ').replace(/\s+/g, ' ').trim() });
  }

  return blocks;
}

// ─── Inline tokenizer ─────────────────────────────────────────────────────

type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

/**
 * Split an inline markdown string into styled runs. Handles `code`, **bold**,
 * and *italic* (plus the __bold__ / _italic_ variants). Nested combinations
 * are supported up to bold+italic via Helvetica-BoldOblique. Links are
 * flattened to their label text — react-pdf has a <Link> element but there's
 * no reliable way to make a click target inside a wrapped Text run without
 * fragile rewrites, and client-facing PDFs rarely need clickable inline links.
 */
function tokenizeInline(raw: string): Inline[] {
  // Flatten links [text](url) → text
  const text = raw
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const runs: Inline[] = [];
  let i = 0;

  // Seed state — mutated as we hit delimiters.
  let bold = false;
  let italic = false;

  const push = (chunk: string, overrides?: Partial<Inline>) => {
    if (!chunk) return;
    runs.push({ text: chunk, bold: overrides?.bold ?? bold, italic: overrides?.italic ?? italic, code: overrides?.code });
  };

  let buffer = '';
  const flush = () => {
    if (buffer.length > 0) {
      push(buffer);
      buffer = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // Inline code — single backticks only for simplicity
    if (ch === '`') {
      flush();
      const end = text.indexOf('`', i + 1);
      if (end === -1) {
        buffer += ch;
        i += 1;
        continue;
      }
      push(text.slice(i + 1, end), { code: true });
      i = end + 1;
      continue;
    }

    // Bold: ** or __
    if ((ch === '*' && next === '*') || (ch === '_' && next === '_')) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }

    // Italic: single * or _
    if (ch === '*' || ch === '_') {
      // Guard against the * in "5 * 3" — require a word boundary on one side.
      const prev = text[i - 1] ?? ' ';
      const after = text[i + 1] ?? ' ';
      const opening = italic
        ? /\S/.test(prev) // closing only if we're inside italic
        : /\S/.test(after); // opening only if next char is non-space
      if (opening) {
        flush();
        italic = !italic;
        i += 1;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return runs;
}

// Exact element type of the react-pdf style objects in `m` — using this
// preserves the strict Style contract react-pdf's <Text> expects and lets
// TypeScript accept the style array without complaint.
type PdfStyle = (typeof m)[keyof typeof m];

function renderInline(raw: string, key?: string | number) {
  const runs = tokenizeInline(raw);
  return (
    <Text key={key}>
      {runs.map((run, idx) => {
        const styles: PdfStyle[] = [];
        if (run.code) styles.push(m.inlineCode);
        if (run.bold && run.italic) styles.push(m.boldItalic);
        else if (run.bold) styles.push(m.bold);
        else if (run.italic) styles.push(m.italic);
        return (
          <Text key={idx} style={styles}>
            {run.text}
          </Text>
        );
      })}
    </Text>
  );
}

// ─── Public renderer ──────────────────────────────────────────────────────

/**
 * Convert a markdown string into an array of keyed react-pdf elements.
 * Caller wraps with its own <View> for layout / spacing context.
 *
 * @param mermaidImages - optional Map<hashMermaidBody, pngDataUrl>. When a
 *   ```mermaid fenced block's hashed body matches a key in the map, the
 *   block renders as an <Image> instead of the labeled source fallback.
 *   Callers produce the map via rasterizeMermaidBlocks() before export.
 */
export function renderMarkdownToPdfBlocks(
  source: string,
  mermaidImages?: Map<string, string>,
  htmlVisualImages?: Map<string, string>,
): JSX.Element[] {
  if (!source.trim()) {
    return [<Text key="empty" style={m.paragraph}>(empty)</Text>];
  }
  const blocks = parseMarkdown(source);

  return blocks.map((block, idx) => {
    if (block.kind === 'heading') {
      const style = block.level === 1 ? m.heading1 : block.level === 2 ? m.heading2 : m.heading3;
      return (
        <Text key={idx} style={style}>
          {renderInline(block.text, `${idx}-inline`)}
        </Text>
      );
    }
    if (block.kind === 'paragraph') {
      return (
        <Text key={idx} style={m.paragraph}>
          {renderInline(block.text, `${idx}-inline`)}
        </Text>
      );
    }
    if (block.kind === 'bullet') {
      return (
        <View key={idx}>
          {block.items.map((item, i) => (
            <View key={i} style={m.listItem} wrap={false}>
              <Text style={m.listMarker}>•</Text>
              <Text style={m.listItemText}>
                {renderInline(item, `${idx}-${i}-inline`)}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    if (block.kind === 'numbered') {
      return (
        <View key={idx}>
          {block.items.map((item, i) => (
            <View key={i} style={m.listItem} wrap={false}>
              <Text style={m.listMarker}>{i + 1}.</Text>
              <Text style={m.listItemText}>
                {renderInline(item, `${idx}-${i}-inline`)}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    if (block.kind === 'code') {
      const isMermaid = block.lang === 'mermaid';
      const isHtmlVisual = block.lang === 'html-visual' || block.lang === 'html';

      // Mermaid fast path: if the caller pre-rasterized this diagram via
      // rasterizeMermaidBlocks, embed it as a real PNG image. Falls back to
      // the labeled-source dump when the hash isn't in the map (which
      // happens when the block failed to render or wasn't pre-rasterized
      // at all — the user still sees something meaningful).
      if (isMermaid && mermaidImages) {
        const hash = hashMermaidBody(block.text.trimEnd());
        const dataUrl = mermaidImages.get(hash);
        if (dataUrl) {
          return (
            <View key={idx} wrap={false}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={dataUrl} style={m.mermaidImage} />
            </View>
          );
        }
      }

      // Html-visual fast path: same pattern as mermaid — if the caller
      // pre-rasterized this block, embed the PNG image.
      if (isHtmlVisual && htmlVisualImages) {
        const hash = hashHtmlVisualBody(block.text.trimEnd());
        const dataUrl = htmlVisualImages.get(hash);
        if (dataUrl) {
          return (
            <View key={idx} wrap={false}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={dataUrl} style={m.mermaidImage} />
            </View>
          );
        }
      }

      // Labeled-source fallback for unrasterized mermaid, html-visual, and
      // generic fenced blocks. The per-message PDF export (html2canvas)
      // captures live SVGs directly and isn't affected by this path.
      const label = isMermaid
        ? 'Mermaid diagram — open in Strategy Lab for the live render'
        : isHtmlVisual
          ? 'HTML visual — open in Strategy Lab for the live render'
          : block.lang
            ? block.lang.toUpperCase()
            : null;
      return (
        <View key={idx} style={m.codeBlock}>
          {label ? <Text style={m.codeBlockLabel}>{label}</Text> : null}
          <Text style={m.codeBlockText}>{block.text}</Text>
        </View>
      );
    }
    return null;
  }).filter((x): x is JSX.Element => x !== null);
}
