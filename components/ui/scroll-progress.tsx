'use client';

import { motion, useScroll } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface ScrollProgressProps {
  className?: string;
}

/**
 * Thin accent-colored bar at the top of the viewport that fills as the user scrolls.
 * Uses `useScroll` from framer-motion so it stays in sync with the page scroll position.
 */
export function ScrollProgress({ className }: ScrollProgressProps) {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-accent',
        className,
      )}
      style={{ scaleX: scrollYProgress }}
    />
  );
}
