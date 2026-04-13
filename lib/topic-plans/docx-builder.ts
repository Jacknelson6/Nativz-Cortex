/**
 * Build a .docx file from a TopicPlan. Opens cleanly in Word and Google Docs,
 * preserves the card layout + symbolic checkboxes, and survives a round-trip
 * through Drive uploads.
 *
 * Layout goal: read like the Kumon x AC deliverable — cover page with
 * counters, per-series headers with engagement stats, and per-topic cards
 * with a stat grid, "why this matters," and YES / MAYBE / NO checkbox row.
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  PageBreak,
  ShadingType,
  Footer,
  PageNumber,
} from 'docx';
import {
  TopicPlan,
  TopicSeries,
  TopicIdea,
  formatAudience,
  resonanceLabel,
  normalizeResonance,
  totalIdeas,
  totalHighResonance,
} from './types';

// Nativz blue accents; kept light so it reads well printed or in Google Docs.
const COLOR_ACCENT = '2CC2C6';
const COLOR_INK = '0F1117';
const COLOR_MUTED = '6A6A7A';
const COLOR_BORDER = 'E4E4EA';
const COLOR_SURFACE = 'F7F7FA';
const COLOR_POSITIVE = '2CC2C6';
const COLOR_NEGATIVE = 'F59E0B';
const COLOR_PRIORITY = 'F97316';

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
  left: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
  right: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
};

function text(
  value: string,
  opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {},
): TextRun {
  return new TextRun({
    text: value,
    bold: opts.bold,
    size: opts.size ?? 20, // docx sizes are half-points
    color: opts.color ?? COLOR_INK,
    italics: opts.italics,
  });
}

function para(runs: TextRun[] | TextRun, opts: {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  spacingBefore?: number;
  spacingAfter?: number;
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
} = {}): Paragraph {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: opts.alignment,
    spacing: { before: opts.spacingBefore ?? 0, after: opts.spacingAfter ?? 100 },
    heading: opts.heading,
  });
}

// ─── Cover page ─────────────────────────────────────────────────────────────

function buildCoverPage(plan: TopicPlan, clientName: string): Paragraph[] {
  // Drop counters that have no real data — a "0 HIGH RESONANCE" or
  // "— COMBINED VIEWS" tile reads as broken on the cover page.
  const counters: Array<{ value: string; label: string }> = [
    { value: plan.series.length.toString(), label: plan.series.length === 1 ? 'CONTENT PILLAR' : 'CONTENT PILLARS' },
    { value: totalIdeas(plan).toString(), label: 'VIDEO TOPICS' },
  ];
  const viewsLabel = sumViewsLabel(plan);
  if (viewsLabel !== '—') {
    counters.push({ value: viewsLabel, label: 'COMBINED VIEWS' });
  }
  const high = totalHighResonance(plan);
  if (high > 0) {
    counters.push({ value: high.toString(), label: 'HIGH RESONANCE' });
  }
  // Pad to 4 cells with neutral blanks so the table stays balanced.
  while (counters.length < 4) counters.push({ value: '', label: '' });

  const out: Paragraph[] = [
    new Paragraph({
      children: [text(clientName.toUpperCase(), { bold: true, size: 22, color: COLOR_MUTED })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
    }),
    new Paragraph({
      children: [text('Content Strategy', { bold: true, size: 56, color: COLOR_INK })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
    }),
    new Paragraph({
      children: [text(plan.title, { bold: true, size: 56, color: COLOR_ACCENT })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  ];

  if (plan.subtitle) {
    out.push(
      new Paragraph({
        children: [text(plan.subtitle, { italics: true, size: 22, color: COLOR_MUTED })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
      }),
    );
  }

  // Counter row — 4-column borderless table so each stat sits in its own cell.
  out.push(
    new Paragraph({ children: [], spacing: { after: 200 } }),
  );
  out.push(
    new Paragraph({
      children: [],
      alignment: AlignmentType.CENTER,
    }),
  );

  const counterTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      left: noBorder.left,
      right: noBorder.right,
      insideHorizontal: noBorder.top,
      insideVertical: noBorder.left,
    },
    rows: [
      new TableRow({
        children: counters.map((c) => new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: noBorder,
          margins: { top: 300, bottom: 300, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [text(c.value, { bold: true, size: 44, color: COLOR_ACCENT })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
            }),
            new Paragraph({
              children: [text(c.label, { size: 16, color: COLOR_MUTED })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        })),
      }),
    ],
  });
  // Table can't live inside a Paragraph array — caller merges via document
  // children. We work around by emitting a placeholder here and letting the
  // caller splice the table in. See buildDocument.
  (out as unknown as { __coverCounterTable?: Table }[]).push({ __coverCounterTable: counterTable });

  if (plan.north_star_metric) {
    out.push(
      new Paragraph({ children: [], spacing: { after: 400 } }),
    );
    out.push(
      new Paragraph({
        children: [
          text('North Star Metric: ', { bold: true, size: 22, color: COLOR_MUTED }),
          text(plan.north_star_metric, { bold: true, size: 22, color: COLOR_ACCENT }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    );
  }

  out.push(
    new Paragraph({
      children: [new TextRun({ children: [new PageBreak()] })],
      spacing: { after: 0 },
    }),
  );

  return out;
}

function sumViewsLabel(plan: TopicPlan): string {
  let sum = 0;
  for (const s of plan.series) {
    if (s.total_views) sum += s.total_views;
  }
  return sum > 0 ? formatAudience(sum) : '—';
}

// ─── "How to use" legend ────────────────────────────────────────────────────

function buildLegend(): (Paragraph | Table)[] {
  const row = (checkbox: string, label: string, desc: string, shade?: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
          margins: { top: 120, bottom: 120, left: 200, right: 200 },
          children: [new Paragraph({
            children: [text(`${checkbox}  `, { size: 22 }), text(label, { bold: true, size: 22 })],
          })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          margins: { top: 120, bottom: 120, left: 200, right: 200 },
          children: [new Paragraph({
            children: [text(desc, { size: 20, color: COLOR_INK })],
          })],
        }),
      ],
    });

  return [
    new Paragraph({
      children: [text('HOW TO USE THIS DOCUMENT', { bold: true, size: 26, color: COLOR_INK })],
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      children: [text('Each topic has a selection row at the bottom. Check one box per topic:', { size: 22 })],
      spacing: { after: 200 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row('☐', 'YES — Film This', 'Approved for scripting and production.', 'ECFDF5'),
        row('☐', 'MAYBE — Review', 'Needs further discussion before committing.', 'FEF3C7'),
        row('☐', 'NO — Skip', 'Not a priority for this production cycle.', 'FEE2E2'),
      ],
    }),
    new Paragraph({ children: [], spacing: { after: 200 } }),
    new Paragraph({
      children: [
        text('Topics marked ', { size: 22 }),
        text('PRIORITY', { bold: true, size: 22, color: COLOR_PRIORITY }),
        text(' are the recommended first-film topics based on resonance data. ', { size: 22 }),
        text('HIGH RESONANCE', { bold: true, size: 22, color: COLOR_ACCENT }),
        text(' topics generate the most shares, saves, and follows.', { size: 22 }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ children: [new PageBreak()] })],
      spacing: { after: 0 },
    }),
  ];
}

// ─── Series header ──────────────────────────────────────────────────────────

function buildSeriesHeader(s: TopicSeries, index: number): (Paragraph | Table)[] {
  const highCount = s.ideas.filter((i) => i.resonance === 'high').length;
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      children: [text(`SERIES ${String(index + 1).padStart(2, '0')}`, { bold: true, size: 20, color: COLOR_MUTED })],
      spacing: { before: 400, after: 100 },
    }),
    new Paragraph({
      children: [text(s.name, { bold: true, size: 40, color: COLOR_INK })],
      spacing: { after: 100 },
    }),
  ];
  if (s.tagline) {
    out.push(new Paragraph({
      children: [text(s.tagline, { size: 22, color: COLOR_MUTED })],
      spacing: { after: 200 },
    }));
  }

  // Series stat row — drop cells whose data isn't there. Topics count is
  // always meaningful; the other three only show up if the Nerd grounded
  // them in actual research metrics.
  const stats: Array<{ value: string; label: string }> = [
    { value: s.ideas.length.toString(), label: 'TOPICS' },
  ];
  if (highCount > 0) {
    stats.push({ value: highCount.toString(), label: 'HIGH RESONANCE' });
  }
  if (s.total_views) {
    stats.push({ value: formatAudience(s.total_views), label: 'TOTAL VIEWS' });
  }
  if (s.engagement_rate) {
    stats.push({ value: s.engagement_rate.toFixed(3), label: 'ENGAGEMENT RATE' });
  }
  // Always 4 cells for visual balance; pad with neutral blanks.
  while (stats.length < 4) stats.push({ value: '', label: '' });

  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_ACCENT },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
      left: noBorder.left,
      right: noBorder.right,
      insideHorizontal: noBorder.top,
      insideVertical: noBorder.left,
    },
    rows: [
      new TableRow({
        children: stats.map((st) => new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: noBorder,
          margins: { top: 160, bottom: 160, left: 100, right: 100 },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_SURFACE },
          children: [
            new Paragraph({
              children: [text(st.value, { bold: true, size: 30, color: COLOR_INK })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 40 },
            }),
            new Paragraph({
              children: [text(st.label, { size: 14, color: COLOR_MUTED })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        })),
      }),
    ],
  }));

  return out;
}

// ─── Idea card ──────────────────────────────────────────────────────────────

function resonanceColor(r: string | null | undefined): string {
  switch (normalizeResonance(r)) {
    case 'viral': return COLOR_PRIORITY;
    case 'high': return COLOR_ACCENT;
    case 'rising': return COLOR_PRIORITY;
    case 'medium': return COLOR_MUTED;
    case 'low': return COLOR_MUTED;
    default: return COLOR_MUTED;
  }
}

function buildIdeaCard(idea: TopicIdea, num: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  // Title row with resonance + priority badges on the right
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorder,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: noBorder,
            margins: { top: 200, bottom: 80, left: 0, right: 0 },
            children: [new Paragraph({
              children: [
                text(`${String(num).padStart(2, '0')}.  `, { bold: true, size: 22, color: COLOR_MUTED }),
                text(idea.title, { bold: true, size: 26, color: COLOR_INK }),
              ],
            })],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            borders: noBorder,
            margins: { top: 200, bottom: 80, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  text(
                    resonanceLabel(idea.resonance) ? `${resonanceLabel(idea.resonance)} RESONANCE` : '',
                    { bold: true, size: 18, color: resonanceColor(idea.resonance) },
                  ),
                ],
              }),
              ...(idea.priority ? [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [text('PRIORITY', { bold: true, size: 18, color: COLOR_PRIORITY })],
              })] : []),
            ],
          }),
        ],
      }),
    ],
  }));

  if (idea.source) {
    out.push(new Paragraph({
      children: [
        text('SOURCE: ', { bold: true, size: 16, color: COLOR_MUTED }),
        text(idea.source, { italics: true, size: 20, color: COLOR_INK }),
      ],
      spacing: { after: 120 },
    }));
  }

  // Stat grid — only render cells that actually have a value. Resonance
  // already has its own tag in the title row so we drop it from the grid
  // (was duplicating). If no quantitative stats are present at all, skip
  // the grid entirely so the card doesn't read as empty placeholders.
  const candidateCells: Array<{ value: string; label: string; fill: string; color: string }> = [];
  const audienceLabel = formatAudience(idea.audience ?? undefined);
  if (audienceLabel) {
    candidateCells.push({ value: audienceLabel, label: 'AUDIENCE', fill: COLOR_SURFACE, color: COLOR_INK });
  }
  if (idea.positive_pct != null) {
    candidateCells.push({ value: `${Math.round(idea.positive_pct)}%`, label: 'POSITIVE', fill: 'ECFDF5', color: COLOR_POSITIVE });
  }
  if (idea.negative_pct != null) {
    candidateCells.push({ value: `${Math.round(idea.negative_pct)}%`, label: 'NEGATIVE', fill: 'FEF3C7', color: COLOR_NEGATIVE });
  }

  if (candidateCells.length > 0) {
    // Pad with a neutral cell so the row always has 4 columns and stays
    // visually balanced with the selection row below it.
    while (candidateCells.length < 4) {
      candidateCells.push({ value: '', label: '', fill: COLOR_SURFACE, color: COLOR_MUTED });
    }
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorder,
      rows: [new TableRow({
        children: candidateCells.map((c) => new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
            left: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
            right: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
          },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: c.fill },
          margins: { top: 140, bottom: 140, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [text(c.value, { bold: true, size: 26, color: c.color })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 40 },
            }),
            new Paragraph({
              children: [text(c.label, { size: 14, color: COLOR_MUTED })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        })),
      })],
    }));
  }

  if (idea.why_it_works) {
    out.push(new Paragraph({ children: [], spacing: { after: 80 } }));
    out.push(new Paragraph({
      children: [
        text('WHY IT WORKS: ', { bold: true, size: 18, color: COLOR_ACCENT }),
        text(idea.why_it_works, { size: 20, color: COLOR_INK }),
      ],
      spacing: { after: 140 },
    }));
  }

  // Selection row — symbolic checkboxes with colored fills per Kumon's style.
  const selectionCell = (symbol: string, label: string, fill: string, textColor: string) =>
    new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      borders: thinBorder,
      shading: { type: ShadingType.CLEAR, color: 'auto', fill },
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      children: [new Paragraph({
        children: [
          text(`${symbol}  `, { size: 22, color: textColor }),
          text(label, { bold: true, size: 20, color: textColor }),
        ],
      })],
    });

  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [
        selectionCell('☐', 'YES — Film This', 'ECFDF5', '065F46'),
        selectionCell('☐', 'MAYBE — Review', 'FEF3C7', '92400E'),
        selectionCell('☐', 'NO — Skip', 'FEE2E2', '991B1B'),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
          children: [new Paragraph({
            children: [text('Notes: ______________', { size: 20, color: COLOR_MUTED })],
          })],
        }),
      ],
    })],
  }));

  out.push(new Paragraph({ children: [], spacing: { after: 280 } }));

  return out;
}

// ─── Closing content-split note ─────────────────────────────────────────────

function buildClosing(plan: TopicPlan): Paragraph[] {
  if (!plan.content_split_note) return [];
  return [
    new Paragraph({
      children: [text('Recommended Content Split', { bold: true, size: 28, color: COLOR_INK })],
      spacing: { before: 400, after: 120 },
    }),
    new Paragraph({
      children: [text(plan.content_split_note, { size: 22, color: COLOR_INK })],
    }),
  ];
}

// ─── Document assembly ──────────────────────────────────────────────────────

export async function buildTopicPlanDocx(
  plan: TopicPlan,
  clientName: string,
): Promise<Buffer> {
  // Cover page emits a placeholder object where the counter table belongs; we
  // extract it so we can splice the Table into the Document children (since a
  // Table isn't a Paragraph).
  const coverRaw = buildCoverPage(plan, clientName);
  const coverChildren: (Paragraph | Table)[] = [];
  for (const entry of coverRaw) {
    if ('__coverCounterTable' in (entry as object)) {
      coverChildren.push((entry as unknown as { __coverCounterTable: Table }).__coverCounterTable);
    } else {
      coverChildren.push(entry as Paragraph);
    }
  }

  const children: (Paragraph | Table)[] = [
    ...coverChildren,
    ...buildLegend(),
  ];

  plan.series.forEach((series, si) => {
    children.push(...buildSeriesHeader(series, si));
    series.ideas.forEach((idea, ii) => {
      children.push(...buildIdeaCard(idea, idea.number ?? ii + 1));
    });
  });

  children.push(...buildClosing(plan));

  const doc = new Document({
    creator: 'Nativz Cortex',
    title: plan.title,
    description: plan.subtitle ?? undefined,
    styles: {
      default: {
        document: {
          run: { font: 'Helvetica', size: 20 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, right: 900, bottom: 1000, left: 900 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                text('Nativz Cortex  ·  ', { size: 16, color: COLOR_MUTED }),
                text(clientName, { size: 16, color: COLOR_MUTED }),
                text('  ·  Page ', { size: 16, color: COLOR_MUTED }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR_MUTED }),
                text(' of ', { size: 16, color: COLOR_MUTED }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR_MUTED }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}
