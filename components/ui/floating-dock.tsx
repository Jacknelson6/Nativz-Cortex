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
      className={`flex flex-col gap-1 ${className}`}
    >
      {items.map((item) => (
        <DockItem key={item.href} mouseY={mouseY} {...item} />
      ))}
    </motion.div>
  );
}

function DockItem({
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

  const scaleTransform = useTransform(distance, [-80, 0, 80], [1, 1.05, 1]);
  const scale = useSpring(scaleTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  const iconScaleTransform = useTransform(distance, [-80, 0, 80], [1, 1.2, 1]);
  const iconScale = useSpring(iconScaleTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <Link href={href}>
      <motion.div
        ref={ref}
        style={{ scale }}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors min-h-[44px] ${
          isActive
            ? 'border-l-[3px] border-accent bg-surface-hover text-text-primary font-semibold'
            : 'border-l-[3px] border-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium'
        }`}
      >
        <motion.span style={{ scale: iconScale }} className="flex items-center">
          {icon}
        </motion.span>
        {title}
      </motion.div>
    </Link>
  );
}
