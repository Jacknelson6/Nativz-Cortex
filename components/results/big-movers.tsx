'use client';

import { Flame, Building2, User, Package, Store } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import type { BigMover } from '@/lib/types/search';

const TYPE_ICON: Record<string, React.ReactNode> = {
  brand: <Store size={14} className="text-orange-400" />,
  creator: <User size={14} className="text-purple-400" />,
  product: <Package size={14} className="text-emerald-400" />,
  company: <Building2 size={14} className="text-blue-400" />,
};

const TYPE_COLOR: Record<string, string> = {
  brand: 'text-orange-400 bg-orange-500/10',
  creator: 'text-purple-400 bg-purple-500/10',
  product: 'text-emerald-400 bg-emerald-500/10',
  company: 'text-blue-400 bg-blue-500/10',
};

export function BigMovers({ movers }: { movers: BigMover[] }) {
  if (!movers || movers.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
          <Flame size={16} className="text-orange-400" />
        </div>
        <CardTitle className="!mb-0">Big movers</CardTitle>
      </div>

      <div className="space-y-3">
        {movers.map((mover, i) => (
          <div
            key={i}
            className="animate-stagger-in rounded-xl border border-nativz-border-light bg-background p-4"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-2 mb-2">
              {TYPE_ICON[mover.type] || TYPE_ICON.brand}
              <span className="text-sm font-semibold text-text-primary">{mover.name}</span>
              <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${TYPE_COLOR[mover.type] || TYPE_COLOR.brand}`}>
                {mover.type}
              </span>
            </div>

            <p className="text-xs text-text-secondary mb-2">{mover.why}</p>

            <ul className="space-y-1 mb-2">
              {mover.tactics.map((tactic, j) => (
                <li key={j} className="flex items-start gap-2 text-xs text-text-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted/50" />
                  {tactic}
                </li>
              ))}
            </ul>

            <p className="text-xs font-medium text-accent-text">{mover.takeaway}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
