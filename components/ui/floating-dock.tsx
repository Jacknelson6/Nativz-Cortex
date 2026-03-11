'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';

interface DockItem {
  title: string;
  icon: ReactNode;
  href: string;
  isActive?: boolean;
}

interface FloatingDockProps {
  items: DockItem[];
  collapsed?: boolean;
  className?: string;
}

export function FloatingDock({ items, collapsed = false, className = '' }: FloatingDockProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {items.map((item) => (
        <DockItemEl key={item.href} collapsed={collapsed} {...item} />
      ))}
    </div>
  );
}

function DockItemEl({
  title,
  icon,
  href,
  isActive,
  collapsed,
}: DockItem & { collapsed: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Link href={href}>
      <div
        ref={ref}
        onMouseEnter={() => collapsed && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`relative flex items-center rounded-lg text-sm transition-all duration-150 min-h-[44px] cursor-pointer hover:scale-[1.05] ${
          collapsed
            ? 'justify-center px-0 py-2.5'
            : 'gap-2.5 px-3 py-2.5'
        } ${
          isActive
            ? `${collapsed ? 'border-l-0' : 'border-l-[3px]'} border-accent bg-surface-hover text-text-primary font-semibold`
            : `${collapsed ? 'border-l-0' : 'border-l-[3px]'} border-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium`
        }`}
      >
        <span className="flex items-center shrink-0 transition-transform duration-150 group-hover:scale-110">
          {icon}
        </span>
        {!collapsed && <span className="truncate">{title}</span>}

        {/* Collapsed tooltip */}
        {collapsed && showTooltip && (
          <div
            className="absolute left-full ml-2 z-50 rounded-lg bg-surface border border-nativz-border px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-dropdown whitespace-nowrap pointer-events-none animate-[sidebarTooltipIn_150ms_ease-out_forwards]"
          >
            {title}
          </div>
        )}
      </div>
    </Link>
  );
}
