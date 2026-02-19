'use client';

import { TextFlip } from '@/components/ui/text-flip';

const EXAMPLE_TOPICS = [
  'real estate lending',
  'sustainable fashion',
  'AI video tools',
  'coffee marketing',
  'plant-based protein',
  'home fitness trends',
  'pet wellness brands',
  'luxury travel 2026',
];

export function SearchHero() {
  return (
    <>
      <h1 className="text-3xl font-bold text-text-primary">
        Research{' '}
        <TextFlip
          words={EXAMPLE_TOPICS}
          interval={3000}
          className="text-accent-text"
        />
      </h1>
      <p className="mt-2 text-text-muted">
        Enter a topic to get AI-powered research, trending insights, and video ideas
      </p>
    </>
  );
}
