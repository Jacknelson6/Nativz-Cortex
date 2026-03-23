'use client';

import { Building2 } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import type { ClientOption } from '@/components/ui/client-picker';
import type { RecentClient } from '@/app/admin/ad-creatives/page';
import { Card } from '@/components/ui/card';

function agencyLabel(agency: string | null | undefined): string | null {
  if (!agency?.trim()) return null;
  const a = agency.toLowerCase();
  if (a.includes('anderson') || a === 'ac') return 'Anderson Collaborative';
  return 'Nativz';
}

function agencyClass(agency: string | null | undefined): string {
  const a = agency?.toLowerCase() ?? '';
  if (a.includes('anderson') || a === 'ac') return 'text-emerald-400/90';
  return 'text-accent-text/90';
}

interface AdCreativesRecentGridProps {
  recentClients: RecentClient[];
  clients: ClientOption[];
  onSelectClient: (id: string) => void;
  disabled?: boolean;
}

/**
 * Recent clients with generated creatives — shown on the landing hero below the omnibar (not in the popover).
 */
export function AdCreativesRecentGrid({
  recentClients,
  clients,
  onSelectClient,
  disabled = false,
}: AdCreativesRecentGridProps) {
  if (recentClients.length === 0) return null;

  return (
    <section aria-label="Recent clients" className="w-full space-y-3">
      <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-text-muted">Recent</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {recentClients.map((rc) => {
          const c = clients.find((x) => x.id === rc.clientId);
          const sub = agencyLabel(c?.agency);
          const count = rc.creativeCount ?? 0;
          const countLabel =
            count > 0 ? `${count} creative${count === 1 ? '' : 's'} generated` : null;

          return (
            <Card
              key={rc.clientId}
              padding="sm"
              interactive
              className={disabled ? 'pointer-events-none opacity-50' : ''}
              role="button"
              tabIndex={disabled ? -1 : 0}
              onClick={() => {
                if (!disabled) onSelectClient(rc.clientId);
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectClient(rc.clientId);
                }
              }}
            >
              <div className="flex items-start gap-2">
                <ClientLogo src={rc.logo_url ?? c?.logo_url} name={rc.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{rc.name}</p>
                  {countLabel ? (
                    <p className="truncate text-[11px] text-text-muted">{countLabel}</p>
                  ) : null}
                  {sub ? (
                    <p
                      className={`truncate text-[10px] font-semibold uppercase tracking-wide ${agencyClass(c?.agency)}`}
                    >
                      {sub}
                    </p>
                  ) : null}
                </div>
                <Building2 size={14} className="shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
