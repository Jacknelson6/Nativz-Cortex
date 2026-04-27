'use client';

import { DollarSign, Search } from 'lucide-react';
import { SubNavLinks } from '@/components/ui/sub-nav';

const TABS = [
  { slug: 'cost' as const,        label: 'Cost',        icon: <DollarSign size={13} /> },
  { slug: 'search-runs' as const, label: 'Search runs', icon: <Search size={13} /> },
];

export type InfrastructureTabSlug = (typeof TABS)[number]['slug'];

export function InfrastructureTabs({ active }: { active: InfrastructureTabSlug }) {
  return (
    <SubNavLinks
      items={TABS}
      active={active}
      memoryKey="cortex:infrastructure:last-tab"
      optimistic
      ariaLabel="Infrastructure sections"
    />
  );
}
