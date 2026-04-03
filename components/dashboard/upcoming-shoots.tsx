'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, ArrowRight, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';

type Shoot = {
  id: string;
  title: string;
  shoot_date: string;
  location: string | null;
  clients: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function normalizeClient(clients: Shoot['clients']): { name: string; slug: string } | null {
  if (!clients) return null;
  if (Array.isArray(clients)) return clients[0] ?? null;
  return clients;
}

export function UpcomingShoots({ initialShoots }: { initialShoots?: Shoot[] }) {
  const [shoots, setShoots] = useState<Shoot[]>(initialShoots ?? []);
  const [loading, setLoading] = useState(!initialShoots);

  useEffect(() => {
    if (initialShoots) return;
    const today = new Date().toISOString().split('T')[0];
    fetch(`/api/shoots?status=scheduled&date_from=${today}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setShoots(data.slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [initialShoots]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Calendar size={16} className="text-accent2-text" />
          Upcoming shoots
        </h2>
        <Link
          href="/admin/shoots"
          className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
              <div className="h-10 w-10 rounded-lg bg-surface-elevated" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-3/4 rounded bg-surface-elevated" />
                <div className="h-3 w-1/2 rounded bg-surface-elevated" />
              </div>
            </div>
          ))}
        </div>
      ) : shoots.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6">No upcoming shoots</p>
      ) : (
        <div className="space-y-2">
          {shoots.map((shoot) => {
            const client = normalizeClient(shoot.clients);
            const shootDate = new Date(shoot.shoot_date);

            return (
              <div
                key={shoot.id}
                className="flex items-center gap-3 rounded-lg border border-nativz-border px-3 py-2.5 hover:bg-surface-elevated transition-colors"
              >
                <div className="flex flex-col items-center justify-center rounded-lg bg-accent2-surface px-2 py-1 min-w-[40px]">
                  <span className="text-sm font-bold text-accent2-text leading-none">
                    {shootDate.getDate()}
                  </span>
                  <span className="text-[10px] font-medium text-accent2-text/60 uppercase">
                    {shootDate.toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-secondary truncate">{shoot.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {client && (
                      <span className="text-xs text-text-muted">{client.name}</span>
                    )}
                    {shoot.location && (
                      <span className="text-xs text-text-muted flex items-center gap-0.5">
                        <MapPin size={8} /> {shoot.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
