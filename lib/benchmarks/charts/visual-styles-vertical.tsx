'use client';

import { useState } from 'react';

// Per-vertical top formats from CH-010 (from PDF pp.15-20)
const VERTICAL_DATA: Record<string, { style: string; metric: string }[]> = {
  'Health & Wellness': [
    { style: 'Stitch', metric: 'Highest hit rate' },
    { style: 'Reaction video', metric: 'High engagement' },
    { style: 'Unboxing', metric: 'Strong spend ratio' },
    { style: 'Celebrity', metric: 'Premium positioning' },
    { style: 'Founder', metric: 'Authentic connection' },
  ],
  'Fashion & Apparel': [
    { style: 'Post-it', metric: 'Highest hit rate' },
    { style: 'Quiz', metric: 'Interactive format' },
    { style: 'Stylized product shot', metric: 'Brand aesthetic' },
    { style: 'Meme', metric: 'Viral potential' },
    { style: 'Product showcase', metric: 'Catalog driver' },
  ],
  'Food & Nutrition': [
    { style: 'Offer-First Banner', metric: 'Top volume format' },
    { style: 'Demo', metric: 'Recipe-style content' },
    { style: 'Testimonial', metric: 'Trust building' },
    { style: 'Unboxing', metric: 'Subscription focus' },
    { style: 'UGC overlay', metric: 'Authentic feel' },
  ],
  'Technology': [
    { style: 'Demo', metric: 'Product-led' },
    { style: 'Screen recording', metric: 'Feature showcase' },
    { style: 'Comparison', metric: 'Competitive positioning' },
    { style: 'Testimonial', metric: 'Social proof' },
    { style: 'Feature benefit point', metric: 'Direct messaging' },
  ],
  'Beauty & Personal Care': [
    { style: 'Before & After', metric: 'Transformation proof' },
    { style: 'UGC overlay', metric: 'Authentic results' },
    { style: 'Testimonial', metric: 'Trust driver' },
    { style: 'Demo', metric: 'Application technique' },
    { style: 'Influencer endorsement', metric: 'Authority' },
  ],
};

const VERTICALS = Object.keys(VERTICAL_DATA);

export function VisualStylesVertical() {
  const [activeVertical, setActiveVertical] = useState(VERTICALS[0]);

  return (
    <div>
      {/* Vertical tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {VERTICALS.map((v) => (
          <button
            key={v}
            onClick={() => setActiveVertical(v)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeVertical === v
                ? 'bg-accent-surface text-accent-text'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Table for selected vertical */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">#</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Visual format</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Strength</th>
          </tr>
        </thead>
        <tbody>
          {(VERTICAL_DATA[activeVertical] ?? []).map((row, i) => (
            <tr
              key={row.style}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-muted">{i + 1}</td>
              <td className="py-3 px-3 text-text-primary font-medium">{row.style}</td>
              <td className="py-3 px-3 text-text-muted text-xs">{row.metric}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
