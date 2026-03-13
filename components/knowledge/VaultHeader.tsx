'use client';

import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

interface VaultHeaderProps {
  clientName: string;
  clientSlug: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function VaultHeader({
  clientName,
  clientSlug,
  searchQuery,
  onSearchChange,
}: VaultHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-nativz-border bg-background shrink-0">
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/clients/${clientSlug}`}
          className="text-text-muted hover:text-text-secondary transition-colors p-1 rounded-lg hover:bg-surface-hover"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-sm font-semibold text-text-primary">
          {clientName}&apos;s vault
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search entries..."
            className="w-52 rounded-lg border border-nativz-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
          />
        </div>
      </div>
    </div>
  );
}
