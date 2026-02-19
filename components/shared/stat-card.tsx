import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon?: ReactNode;
}

export function StatCard({ title, value, subtitle, change, icon }: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {change !== undefined && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                  change >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {change >= 0 ? '+' : ''}{change}%
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {icon && (
          <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">{icon}</div>
        )}
      </div>
    </Card>
  );
}
