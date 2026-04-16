/**
 * Fixture data for branded-deliverable PDF previews. Used by:
 *  - `app/api/admin/pdf/preview/branded-deliverable/route.tsx` (web preview)
 *  - `scripts/render-branded-preview.tsx` (local render to disk)
 */

import type { BrandedDeliverableData } from './types';

export const BRANDED_PREVIEW_FIXTURE: BrandedDeliverableData = {
  eyebrow: 'Safe Stop',
  kicker: 'Content Strategy',
  title: 'Video Ideas',
  summary:
    '40 short-form video ideas grounded in truck parking safety research. Built from the attached truck parking, secure fleet parking, and truck parking safety topic searches.',
  stats: [
    { value: '3', label: 'Content pillars' },
    { value: '40', label: 'Video topics' },
    { value: '37', label: 'High resonance' },
  ],
  highlight: {
    label: 'North Star Metric',
    value: 'Reserved spot inquiries and qualified parking leads',
  },
  legend: {
    heading: 'How to read this document',
    intro:
      'Each topic sits inside a series and carries its resonance signal. Priority topics are the recommended first-film picks based on sentiment data — they generate the most shares, saves, and follows.',
    items: [
      { label: 'Viral resonance', description: 'Strongest signal — high engagement and sentiment in the source research.', tone: 'primary' },
      { label: 'High resonance', description: 'Solid signal — proven topics that consistently perform.', tone: 'positive' },
      { label: 'Medium resonance', description: 'Emerging signal — worth testing once priority topics are in flight.', tone: 'warning' },
    ],
    footnote:
      'Metrics come from the sentiment and audience counts in each underlying topic search. "Why it works" captures the editorial judgment behind each pick.',
  },
  series: [
    {
      label: 'Series 01',
      title: 'Night Arrival & Overnight Parking',
      subtitle: 'Show what drivers actually face when the lot fills up after dark.',
      stats: [
        { value: '11', label: 'Topics' },
        { value: '8', label: 'High resonance' },
      ],
      topics: [
        {
          number: '01.',
          title: 'What happens when every truck stop is full',
          source: 'Overnight truck parking stress',
          resonanceLabel: 'Viral resonance',
          priorityLabel: 'Priority',
          metrics: [
            { label: 'Audience', value: '68', tone: 'neutral' },
            { label: 'Positive', value: '0%', tone: 'positive' },
            { label: 'Negative', value: '62%', tone: 'negative' },
          ],
          whyItWorks: 'Directly matches the late-night scarcity problem driving the strongest negative sentiment.',
        },
        {
          number: '02.',
          title: 'Daytime parking vs overnight parking',
          source: 'Overnight truck parking stress',
          resonanceLabel: 'Viral resonance',
          priorityLabel: 'Priority',
          metrics: [
            { label: 'Audience', value: '68', tone: 'neutral' },
            { label: 'Positive', value: '0%', tone: 'positive' },
            { label: 'Negative', value: '62%', tone: 'negative' },
          ],
          whyItWorks: 'Compares the exact capacity shift drivers are complaining about after dark.',
        },
        {
          number: '03.',
          title: 'The 3 backup options drivers actually use',
          source: 'Overnight truck parking stress',
          resonanceLabel: 'Viral resonance',
          metrics: [
            { label: 'Audience', value: '68', tone: 'neutral' },
            { label: 'Positive', value: '0%', tone: 'positive' },
            { label: 'Negative', value: '62%', tone: 'negative' },
          ],
          whyItWorks: 'Turns a stressful problem into a practical decision tree drivers can use immediately.',
        },
      ],
    },
    {
      label: 'Series 02',
      title: 'Security Proof & Trust Checks',
      subtitle: 'Make safety visible instead of claimed.',
      stats: [
        { value: '18', label: 'Topics' },
        { value: '18', label: 'High resonance' },
      ],
      topics: [
        {
          number: '12.',
          title: 'Dallas secure lot audit in 30 seconds',
          source: 'Dallas secure truck parking trust audits',
          resonanceLabel: 'Viral resonance',
          priorityLabel: 'Priority',
          metrics: [
            { label: 'Audience', value: '58', tone: 'neutral' },
            { label: 'Positive', value: '68%', tone: 'positive' },
            { label: 'Negative', value: '0%', tone: 'negative' },
          ],
          whyItWorks: 'Answers the core trust question with visual proof and fast pacing.',
        },
        {
          number: '13.',
          title: 'What makes a Dallas lot actually secure?',
          source: 'Dallas secure truck parking trust audits',
          resonanceLabel: 'Viral resonance',
          metrics: [
            { label: 'Audience', value: '58', tone: 'neutral' },
            { label: 'Positive', value: '68%', tone: 'positive' },
            { label: 'Negative', value: '0%', tone: 'negative' },
          ],
          whyItWorks: 'Turns skepticism into a clear checklist viewers can use.',
        },
      ],
    },
  ],
};
