'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { DateRangePreset, DateRange } from '@/lib/types/reporting';

interface ClientOption {
  id: string;
  name: string;
  slug: string;
  hasUppromote: boolean;
  services: string[];
  agency?: string | null;
  logoUrl?: string | null;
  affiliate_digest_email_enabled?: boolean;
  affiliate_digest_recipients?: string | null;
  affiliate_digest_timezone?: string;
  affiliate_digest_send_day_of_week?: number;
  affiliate_digest_send_hour?: number;
  affiliate_digest_send_minute?: number;
  affiliate_digest_last_sent_week_key?: string | null;
}

export interface AffiliateKpis {
  newAffiliates: number;
  totalAffiliates: number;
  activeAffiliates: number;
  referralsInPeriod: number;
  periodRevenue: number;
  totalRevenue: number;
  periodCommission: number;
  totalClicks: number;
  totalPending: number;
}

export interface SnapshotPoint {
  snapshot_date: string;
  total_affiliates: number;
  active_affiliates: number;
  total_referrals: number;
  total_revenue: number;
  total_clicks: number;
  daily_sales_count: number;
  daily_revenue: number;
}

export interface TopAffiliate {
  uppromote_id: number;
  name: string;
  email: string;
  status: string;
  program: string | null;
  revenue: number;
  commission: number;
  clicks: number;
  referrals: number;
  pending: number;
  joined: string | null;
}

export interface RecentReferral {
  uppromote_id: number;
  orderNumber: number | null;
  affiliateName: string;
  totalSales: number;
  status: string;
  trackingType: string | null;
  date: string | null;
}

export interface PendingPayout {
  name: string;
  email: string;
  pending: number;
  paid: number;
}

function getDateRange(preset: DateRangePreset, customRange?: DateRange): DateRange {
  const today = new Date();
  const end = today.toISOString().split('T')[0];

  switch (preset) {
    case '7d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { start: start.toISOString().split('T')[0], end };
    }
    case '30d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start: start.toISOString().split('T')[0], end };
    }
    case 'mtd': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: start.toISOString().split('T')[0], end };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: start.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
    }
    case 'ytd': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start: start.toISOString().split('T')[0], end };
    }
    case 'custom': {
      if (customRange) return customRange;
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start: start.toISOString().split('T')[0], end };
    }
    default: {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start: start.toISOString().split('T')[0], end };
    }
  }
}

export function useAffiliatesData() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [kpis, setKpis] = useState<AffiliateKpis | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([]);
  const [topAffiliates, setTopAffiliates] = useState<TopAffiliate[]>([]);
  const [recentReferrals, setRecentReferrals] = useState<RecentReferral[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<PendingPayout[]>([]);

  const refreshClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      const raw = Array.isArray(data) ? data : data.clients ?? [];
      const all: ClientOption[] = raw.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        hasUppromote: !!(c.uppromote_api_key),
        services: Array.isArray(c.services) ? (c.services as string[]) : [],
        agency: (c.agency as string) ?? null,
        logoUrl: (c.logo_url as string) ?? null,
        affiliate_digest_email_enabled: Boolean(c.affiliate_digest_email_enabled),
        affiliate_digest_recipients: (c.affiliate_digest_recipients as string) ?? null,
        affiliate_digest_timezone: (c.affiliate_digest_timezone as string) ?? 'UTC',
        affiliate_digest_send_day_of_week:
          typeof c.affiliate_digest_send_day_of_week === 'number'
            ? c.affiliate_digest_send_day_of_week
            : 3,
        affiliate_digest_send_hour:
          typeof c.affiliate_digest_send_hour === 'number' ? c.affiliate_digest_send_hour : 14,
        affiliate_digest_send_minute:
          typeof c.affiliate_digest_send_minute === 'number' ? c.affiliate_digest_send_minute : 0,
        affiliate_digest_last_sent_week_key:
          (c.affiliate_digest_last_sent_week_key as string) ?? null,
      }));
      const list = all.filter((c) => c.services.includes('Affiliates'));
      setClients(list);
      setSelectedClientId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? '';
      });
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  const dateRange = getDateRange(datePreset, customRange);

  const fetchData = useCallback(async () => {
    if (!selectedClientId) return;
    setDataLoading(true);

    try {
      const params = new URLSearchParams({
        clientId: selectedClientId,
        start: dateRange.start,
        end: dateRange.end,
      });

      const res = await fetch(`/api/affiliates?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      setKpis(data.kpis ?? null);
      setSnapshots(data.snapshots ?? []);
      setTopAffiliates(data.topAffiliates ?? []);
      setRecentReferrals(data.recentReferrals ?? []);
      setPendingPayouts(data.pendingPayouts ?? []);
    } catch {
      toast.error('Failed to load affiliate data');
    } finally {
      setDataLoading(false);
    }
  }, [selectedClientId, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/cron/sync-affiliates', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      toast.success('Affiliate sync complete');
      await fetchData();
    } catch {
      toast.error('Failed to sync affiliates');
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  return {
    clients,
    selectedClient,
    selectedClientId,
    setSelectedClientId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
    dateRange,
    kpis,
    snapshots,
    topAffiliates,
    recentReferrals,
    pendingPayouts,
    loading,
    dataLoading,
    syncing,
    syncNow,
    refreshClients,
  };
}
