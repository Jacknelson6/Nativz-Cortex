'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  DateRangePreset,
  DateRange,
  ComparePreset,
  SummaryReport,
  TopPostItem,
} from '@/lib/types/reporting';
import { resolvePresetRange } from '@/lib/reporting/date-presets';

interface ClientOption {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  agency?: string | null;
}

export function useReportingData(initialClientId?: string | null) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('last_28d');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparePreset, setComparePreset] = useState<ComparePreset>('previous_period');
  const [compareRange, setCompareRange] = useState<DateRange | null>(null);
  const [activeView, setActiveView] = useState<'summary' | 'top-posts'>('summary');
  const [topPostsLimit, setTopPostsLimit] = useState(3);
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [topPosts, setTopPosts] = useState<TopPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Fetch clients on mount
  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch('/api/clients');
        const data = await res.json();
        const raw = Array.isArray(data) ? data : data.clients ?? [];
        const list: ClientOption[] = raw.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          slug: c.slug as string,
          logo_url: (c.logo_url as string | null) ?? null,
          agency: (c.agency as string | null) ?? null,
        }));
        setClients(list);
        if (list.length > 0) {
          setSelectedClientId((prev) => {
            if (prev) return prev;
            const preferred =
              initialClientId && list.some((c) => c.id === initialClientId) ? initialClientId : list[0].id;
            return preferred;
          });
        }
      } catch {
        toast.error('Failed to load clients');
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, [initialClientId]);

  const dateRange = resolvePresetRange(datePreset, customRange);

  // Fetch data when dependencies change
  const fetchData = useCallback(async () => {
    if (!selectedClientId) return;

    setDataLoading(true);
    try {
      const params = new URLSearchParams({
        clientId: selectedClientId,
        start: dateRange.start,
        end: dateRange.end,
      });

      if (activeView === 'summary') {
        const res = await fetch(`/api/reporting/summary?${params}`);
        if (!res.ok) throw new Error('Failed to fetch summary');
        const data = await res.json();
        setSummary(data);
      } else {
        params.set('limit', String(topPostsLimit));
        const res = await fetch(`/api/reporting/top-posts?${params}`);
        if (!res.ok) throw new Error('Failed to fetch top posts');
        const data = await res.json();
        setTopPosts(data.posts ?? data ?? []);
      }
    } catch {
      toast.error('Failed to load reporting data');
    } finally {
      setDataLoading(false);
    }
  }, [selectedClientId, dateRange.start, dateRange.end, activeView, topPostsLimit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const syncNow = useCallback(async () => {
    if (!selectedClientId) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/reporting/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          dateRange,
        }),
      });
      if (!res.ok) throw new Error('Sync failed');
      toast.success('Sync complete');
      await fetchData();
    } catch {
      toast.error('Failed to sync data');
    } finally {
      setSyncing(false);
    }
  }, [selectedClientId, dateRange, fetchData]);

  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const fetchTopPostsForReport = useCallback(
    async (limit: number): Promise<TopPostItem[]> => {
      if (!selectedClientId) return [];
      const params = new URLSearchParams({
        clientId: selectedClientId,
        start: dateRange.start,
        end: dateRange.end,
        limit: String(limit),
      });
      const res = await fetch(`/api/reporting/top-posts?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.posts ?? data ?? [];
    },
    [selectedClientId, dateRange.start, dateRange.end],
  );

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
    compareEnabled,
    setCompareEnabled,
    comparePreset,
    setComparePreset,
    compareRange,
    setCompareRange,
    activeView,
    setActiveView,
    topPostsLimit,
    setTopPostsLimit,
    summary,
    topPosts,
    loading,
    dataLoading,
    syncing,
    syncNow,
    refreshData,
    fetchTopPostsForReport,
  };
}
