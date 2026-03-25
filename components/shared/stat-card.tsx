import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: ReactNode;
  value: string;
  subtitle?: string;
  change?: number;
  icon?: ReactNode;
  /** Extra content below the main stat (e.g. platform breakdown). */
  footer?: ReactNode;
}

export function StatCard({ title, value, subtitle, change, icon, footer }: StatCardProps) {
  return (
    <Card className="h-full hover:shadow-card-hover transition-all duration-200">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-text-muted">{title}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-text-primary">{value}</p>
              {change !== undefined && (
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                    change >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {change >= 0 ? '+' : ''}{change}%
                </span>
              )}
            </div>
            {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
          </div>
          {icon && (
            <div className="rounded-lg bg-accent-surface p-2.5 text-accent-text">{icon}</div>
          )}
        </div>
        {footer ? <div className="mt-3 border-t border-nativz-border/70 pt-3">{footer}</div> : null}
      </div>
    </Card>
  );
}
