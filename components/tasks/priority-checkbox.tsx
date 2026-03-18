'use client';

import { PRIORITY_RING, PRIORITY_FILL } from './task-constants';

export function PriorityCheckbox({
  priority,
  checked,
  onToggle,
}: {
  priority: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const ringColor = PRIORITY_RING[priority] ?? PRIORITY_RING.medium;
  const fillColor = PRIORITY_FILL[priority] ?? PRIORITY_FILL.medium;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="shrink-0 group/check cursor-pointer focus:outline-none"
      aria-label={checked ? 'Mark incomplete' : 'Mark complete'}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="block">
        <circle
          cx="10"
          cy="10"
          r="8.5"
          fill={checked ? fillColor : 'transparent'}
          stroke={ringColor}
          strokeWidth="2"
          className="transition-all duration-200 ease-out group-hover/check:opacity-90"
          style={{ opacity: checked ? 1 : 0.7 }}
        />
        <path
          d="M6 10.5L8.5 13L14 7.5"
          fill="none"
          stroke={checked ? 'var(--background)' : 'transparent'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 20,
            strokeDashoffset: checked ? 0 : 20,
            transition: 'stroke-dashoffset 150ms ease-out 50ms, stroke 100ms ease',
          }}
        />
      </svg>
    </button>
  );
}
