'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import type { CalendarPost, MediaItem, ClientOption, ConnectedProfile } from '../types';

export function useSchedulerData(
  initialClients?: ClientOption[],
  initialClientId?: string | null,
) {
  const searchParams = useSearchParams();
  const urlClientId = searchParams.get('client_id');
  // Optimistic brand id from the top-bar pill. This flips the moment the
  // user picks a brand, before the server roundtrip + router.refresh that
  // would update `initialClientId`. Using it as the source of truth closes
  // the race window where the dialog could capture the previous brand and
  // file a drop under the wrong client.
  const { brand: activeBrand } = useActiveBrand();

  const hasInitial = !!initialClients?.length;
  const [clients, setClients] = useState<ClientOption[]>(initialClients ?? []);
  // Precedence: explicit URL param > optimistic active brand > server seed >
  // first client. The optimistic brand wins so the dialog and downstream
  // fetches always reflect the pill the user is looking at.
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    urlClientId ?? activeBrand?.id ?? initialClientId ?? (initialClients?.[0]?.id ?? null),
  );
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [profiles, setProfiles] = useState<ConnectedProfile[]>([]);
  const [loading, setLoading] = useState(!hasInitial);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Pill-driven sync. Subscribe to the optimistic active brand so the
  // calendar reacts the instant the user picks a brand, not after the
  // server roundtrip. The previous implementation waited for
  // `initialClientId` to refresh, which left a race window during which
  // the New Drop dialog could capture the prior brand id.
  useEffect(() => {
    if (activeBrand?.id && activeBrand.id !== selectedClientId) {
      setSelectedClientId(activeBrand.id);
    }
    // selectedClientId intentionally omitted — only the pill should drive
    // this effect; in-page picks set selectedClientId directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  // Fetch clients on mount (skip if server-provided)
  useEffect(() => {
    if (hasInitial) return;
    async function fetchClients() {
      try {
        const res = await fetch('/api/clients');
        if (!res.ok) throw new Error('Failed to load clients');
        const data = await res.json();
        const clientList = (data.clients ?? data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          slug: c.slug as string,
          default_posting_time: (c.default_posting_time as string) ?? null,
          default_posting_timezone: (c.default_posting_timezone as string) ?? null,
        }));
        setClients(clientList);
        if (clientList.length > 0 && !selectedClientId) {
          setSelectedClientId(clientList[0].id);
        }
      } catch {
        toast.error('Failed to load clients');
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch posts when client changes
  const fetchPosts = useCallback(async (clientId: string, startDate: string, endDate: string) => {
    try {
      const res = await fetch(
        `/api/scheduler/posts?client_id=${clientId}&start=${startDate}&end=${endDate}`
      );
      if (!res.ok) {
        console.error('Posts fetch failed:', res.status, await res.text().catch(() => ''));
        setPosts([]);
        return;
      }
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch (err) {
      console.error('Posts fetch error:', err);
      setPosts([]);
    }
  }, []);

  // Fetch media when client changes
  const fetchMedia = useCallback(async (clientId: string, unusedOnly = false) => {
    setMediaLoading(true);
    try {
      const params = new URLSearchParams({ client_id: clientId });
      if (unusedOnly) params.set('unused', 'true');
      const res = await fetch(`/api/scheduler/media?${params}`);
      if (!res.ok) {
        console.error('Media fetch failed:', res.status, await res.text().catch(() => ''));
        setMedia([]);
        return;
      }
      const data = await res.json();
      setMedia(data.media ?? []);
    } catch (err) {
      console.error('Media fetch error:', err);
      setMedia([]);
    } finally {
      setMediaLoading(false);
    }
  }, []);

  // Fetch connected profiles for client
  const fetchProfiles = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/scheduler/profiles?client_id=${clientId}`);
      if (!res.ok) throw new Error('Failed to load profiles');
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } catch {
      // Profiles may not be set up yet — not an error
      setProfiles([]);
    }
  }, []);

  // Refresh all data for current client
  const refresh = useCallback(async (startDate: string, endDate: string) => {
    if (!selectedClientId) return;
    await Promise.all([
      fetchPosts(selectedClientId, startDate, endDate),
      fetchMedia(selectedClientId),
      fetchProfiles(selectedClientId),
    ]);
  }, [selectedClientId, fetchPosts, fetchMedia, fetchProfiles]);

  return {
    clients,
    selectedClientId,
    setSelectedClientId,
    posts,
    setPosts,
    media,
    setMedia,
    profiles,
    loading,
    mediaLoading,
    fetchPosts,
    fetchMedia,
    fetchProfiles,
    refresh,
  };
}
