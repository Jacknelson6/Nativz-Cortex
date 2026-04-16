/**
 * Render branded-deliverable PDFs for multiple document types × both agency
 * themes to ~/Desktop.
 *
 * Run:  npx tsx scripts/render-branded-preview.tsx
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getTheme, type AgencySlug } from '../lib/branding';
import { BrandedDeliverableDocument, type BrandedDeliverableData } from '../lib/pdf/branded';
import { mapTopicPlanToBranded, mapIdeasToBranded } from '../lib/pdf/branded/adapters';
import type { TopicPlan } from '../lib/topic-plans/types';

// ── Fixtures ─────────────────────────────────────────────────────

const TOPIC_PLAN_FIXTURE: TopicPlan = {
  title: 'Truck Parking Safety',
  subtitle: '12 short-form video ideas for truck parking safety, grounded in topic research.',
  north_star_metric: 'Reserved spot inquiries and qualified parking leads',
  series: [
    {
      name: 'Night Arrival & Overnight Parking',
      tagline: 'Show what drivers actually face when the lot fills up after dark.',
      ideas: [
        { number: 1, title: 'What happens when every truck stop is full', source: 'Overnight truck parking stress', audience: 68_000_000, positive_pct: 0, negative_pct: 62, resonance: 'viral', priority: true, why_it_works: 'Directly matches the late-night scarcity problem driving the strongest negative sentiment.' },
        { number: 2, title: 'Daytime parking vs overnight parking', source: 'Overnight truck parking stress', audience: 68_000_000, positive_pct: 0, negative_pct: 62, resonance: 'viral', priority: true, why_it_works: 'Compares the exact capacity shift drivers are complaining about after dark.' },
        { number: 3, title: 'The 3 backup options drivers actually use', source: 'Overnight truck parking stress', audience: 68_000_000, positive_pct: 0, negative_pct: 62, resonance: 'high', why_it_works: 'Turns a stressful problem into a practical decision tree drivers can use immediately.' },
        { number: 4, title: 'Why truckers park on highway shoulders', source: 'Overnight truck parking stress', audience: 68_000_000, positive_pct: 5, negative_pct: 58, resonance: 'high', why_it_works: 'Shows the dangerous reality drivers face when they can\'t find a spot.' },
        { number: 5, title: 'How to check lot availability before you arrive', source: 'Safe parking apps', audience: 52_000_000, positive_pct: 45, negative_pct: 12, resonance: 'medium', why_it_works: 'Provides a practical solution viewers can use immediately.' },
      ],
    },
    {
      name: 'Security Proof & Trust Checks',
      tagline: 'Make safety visible instead of claimed.',
      ideas: [
        { number: 6, title: 'Dallas secure lot audit in 30 seconds', source: 'Dallas secure truck parking trust audits', audience: 58_000_000, positive_pct: 68, negative_pct: 0, resonance: 'viral', priority: true, why_it_works: 'Answers the core trust question with visual proof and fast pacing.' },
        { number: 7, title: 'What makes a Dallas lot actually secure?', source: 'Dallas secure truck parking trust audits', audience: 58_000_000, positive_pct: 68, negative_pct: 0, resonance: 'viral', why_it_works: 'Turns skepticism into a clear checklist viewers can use.' },
        { number: 8, title: 'Night test: parking after dark in Dallas', source: 'Dallas secure truck parking trust audits', audience: 58_000_000, positive_pct: 55, negative_pct: 10, resonance: 'high', priority: true, why_it_works: 'Night visuals reinforce the security message and make the facility feel real.' },
        { number: 9, title: 'How cameras actually deter truck theft', source: 'DFW secure truck parking', audience: 42_000_000, positive_pct: 62, negative_pct: 8, resonance: 'high', why_it_works: 'Explains the deterrent effect with concrete data drivers trust.' },
      ],
    },
    {
      name: 'Driver Lifestyle & Community',
      tagline: 'Content that earns trust before talking about the product.',
      ideas: [
        { number: 10, title: 'A day in the life of a long-haul trucker', source: 'Trucker lifestyle content', audience: 120_000_000, positive_pct: 72, negative_pct: 5, resonance: 'viral', priority: true, why_it_works: 'Humanizes the audience and builds emotional connection before any sales message.' },
        { number: 11, title: 'What truckers actually eat on the road', source: 'Trucker lifestyle content', audience: 95_000_000, positive_pct: 65, negative_pct: 8, resonance: 'high', why_it_works: 'Relatable lifestyle content that performs well across all platforms.' },
        { number: 12, title: 'The trucker morning routine nobody talks about', source: 'Driver lifestyle and fatigue', audience: 68_000_000, positive_pct: 48, negative_pct: 24, resonance: 'medium', why_it_works: 'Small routine moments are relatable and easy to film.' },
      ],
    },
  ],
};

const IDEAS_FIXTURE = [
  { title: 'Hook: "Every truck stop is full tonight"', why_it_works: ['Matches the scarcity fear', 'Strong negative sentiment topic'], content_pillar: 'Safety & Scarcity' },
  { title: 'Side-by-side: day vs night parking', why_it_works: ['Visual contrast drives engagement', 'Shows the problem in real time'], content_pillar: 'Safety & Scarcity' },
  { title: 'POV: arriving at a full lot at 2am', why_it_works: ['Emotional relatability', 'First-person perspective hooks attention'], content_pillar: 'Safety & Scarcity' },
  { title: 'The hidden cost of parking on the shoulder', why_it_works: ['Ties to safety regulations', 'Financial angle drives saves'], content_pillar: 'Compliance & Cost' },
  { title: 'What fleet managers actually want from parking', why_it_works: ['B2B angle for fleet decision-makers', 'Educational content builds authority'], content_pillar: 'Compliance & Cost' },
  { title: '3 signs a parking lot is actually secure', why_it_works: ['Checklist format drives saves', 'Practical advice builds trust'], content_pillar: 'Trust & Proof' },
  { title: 'We tested 5 truck parking apps — here\'s what happened', why_it_works: ['Review format performs well', 'Drivers actively searching for solutions'], content_pillar: 'Trust & Proof' },
  { title: 'Real security footage from our lot at 3am', why_it_works: ['Proof of safety claim', 'Nighttime content is inherently dramatic'], content_pillar: 'Trust & Proof' },
];

// ── Render ────────────────────────────────────────────────────────

interface DocSpec {
  label: string;
  data: BrandedDeliverableData;
}

async function main() {
  const outDir = path.join(os.homedir(), 'Desktop');
  const slugs: AgencySlug[] = ['nativz', 'anderson'];

  const specs: DocSpec[] = [
    { label: 'Topic-Plan', data: mapTopicPlanToBranded(TOPIC_PLAN_FIXTURE, 'Safe Stop') },
    { label: 'Video-Ideas', data: mapIdeasToBranded(IDEAS_FIXTURE, 'Safe Stop', 'video', 'truck parking safety') },
  ];

  for (const slug of slugs) {
    const theme = getTheme(slug);
    for (const spec of specs) {
      const buffer = await renderToBuffer(
        createElement(BrandedDeliverableDocument, { data: spec.data, theme }),
      );
      const name = `${spec.label}-${theme.name.replace(/\s+/g, '-')}.pdf`;
      const out = path.join(outDir, name);
      fs.writeFileSync(out, buffer);
      console.log('✓', name, `(${buffer.length.toLocaleString()} bytes)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
