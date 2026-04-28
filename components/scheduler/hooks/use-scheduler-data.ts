'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { CalendarPost, MediaItem, ClientOption, ConnectedProfile } from '../types';

export function useSchedulerData(
  initialClients?: ClientOption[],
  initialClientId?: string | null,
) {
  const searchParams = useSearchParams();
  const urlClientId = searchParams.get('client_id');

  const hasInitial = !!initialClients?.length;
  const [clients, setClients] = useState<ClientOption[]>(initialClients ?? []);
  // Precedence: explicit URL param > server-resolved active brand >
  // first client in the list. Binding to the active brand lets the calendar
  // mirror whatever the top-bar pill shows on first paint.
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    urlClientId ?? initialClientId ?? (initialClients?.[0]?.id ?? null),
  );
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [profiles, setProfiles] = useState<ConnectedProfile[]>([]);
  const [loading, setLoading] = useState(!hasInitial);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Brand-pill → calendar one-way sync. When the top-bar brand pill changes,
  // it triggers `router.refresh()`, which re-runs the calendar server
  // component with a new `initialClientId`. The state set above only fires
  // once, so we mirror later changes here. Calendar dropdown picks set
  // `selectedClientId` directly and aren't affected by this effect because
  // a pill change is what moves `initialClientId`, not the dropdown.
  useEffect(() => {
    if (initialClientId && initialClientId !== selectedClientId) {
      setSelectedClientId(initialClientId);
    }
    // selectedClientId intentionally omitted — we only want to sync when the
    // server-provided active brand changes, not on every dropdown pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId]);

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
