'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  DateRangePreset,
  DateRange,
  SummaryReport,
  TopPostItem,
} from '@/lib/types/reporting';

interface ClientOption {
  id: string;
  name: string;
  slug: string;
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

export function useReportingData() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
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
        const list: ClientOption[] = Array.isArray(data)
          ? data
          : data.clients ?? [];
        setClients(list);
        if (list.length > 0 && !selectedClientId) {
          setSelectedClientId(list[0].id);
        }
      } catch {
        toast.error('Failed to load clients');
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dateRange = getDateRange(datePreset, customRange);

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

  return {
    clients,
    selectedClientId,
    setSelectedClientId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
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
  };
}
