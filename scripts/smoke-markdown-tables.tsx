/**
 * Parser smoke test — renders the Markdown component with a mixed input
 * containing a GFM table, a mermaid block, and regular paragraphs, and
 * asserts that (a) a <table> tag is produced and (b) the table has the
 * right number of header and data cells.
 *
 * Run: npx tsx scripts/smoke-markdown-tables.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Markdown } from '../components/ai/markdown';

// Mermaid + html-visual blocks are intentionally omitted — this script
// runs under tsx/esbuild's JSX loader which trips over rich-code-block.tsx's
// use of <>…</> fragments without an explicit React default import. Not a
// production issue (Next's SWC auto-handles the modern jsx-runtime); but it
// makes a pure-table smoke test cleaner if we don't evaluate those
// components at all.
const sample = `
# Hook comparison

Here are two scripts head-to-head:

| Version | Hook | Strength |
|---|---|---|
| A | "My 7yo outsold my sales team" | Specificity + curiosity |
| B | "Sales tip that changed my life" | Generic — cut |

Follow-up thoughts below.

Final paragraph.
`;

const html = renderToStaticMarkup(React.createElement(Markdown, { content: sample }));

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

assert(html.includes('<table'), 'renders a <table> element');
assert((html.match(/<th[\s>]/g) ?? []).length === 3, 'renders exactly 3 header cells');
assert((html.match(/<td[\s>]/g) ?? []).length === 6, 'renders exactly 6 data cells (2 rows × 3 cols)');
assert(html.includes('My 7yo outsold'), 'body cell content is preserved');
assert(!html.includes('|---|'), 'divider row is not rendered as literal text');

console.log('\nSnippet (first 1500 chars):\n', html.slice(0, 1500));
