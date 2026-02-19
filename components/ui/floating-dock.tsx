'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';

interface DockItem {
  title: string;
  icon: ReactNode;
  href: string;
  isActive?: boolean;
}

interface FloatingDockProps {
  items: DockItem[];
  className?: string;
}

export function FloatingDock({ items, className = '' }: FloatingDockProps) {
  const mouseY = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseY.set(e.pageY)}
      onMouseLeave={() => mouseY.set(Infinity)}
      className={`flex flex-col items-center gap-2 ${className}`}
    >
      {items.map((item) => (
        <DockIcon key={item.href} mouseY={mouseY} {...item} />
      ))}
    </motion.div>
  );
}

function DockIcon({
  mouseY,
  title,
  icon,
  href,
  isActive,
}: DockItem & { mouseY: MotionValue }) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  const sizeTransform = useTransform(distance, [-100, 0, 100], [40, 52, 40]);
  const size = useSpring(sizeTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <Link href={href} className="group relative">
      <motion.div
        ref={ref}
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-xl transition-colors ${
          isActive
            ? 'bg-accent-surface text-accent-text'
            : 'bg-surface-hover text-text-muted hover:text-text-primary'
        }`}
      >
        {icon}
      </motion.div>
      {/* Tooltip label */}
      <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface border border-nativz-border px-2.5 py-1 text-xs font-medium text-text-primary shadow-dropdown opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {title}
        {/* Arrow */}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-surface" />
      </div>
    </Link>
  );
}
