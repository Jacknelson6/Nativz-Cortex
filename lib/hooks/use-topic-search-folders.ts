'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TopicSearchFolder } from '@/lib/research/topic-search-folders';

export function useTopicSearchFolders(enabled: boolean) {
  const [folders, setFolders] = useState<TopicSearchFolder[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch('/api/research/folders');
      if (!res.ok) return;
      const data = (await res.json()) as { folders?: TopicSearchFolder[] };
      setFolders(data.folders ?? []);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createFolder = useCallback(
    async (name: string) => {
      const res = await fetch('/api/research/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Could not create folder');
      }
      await refresh();
    },
    [refresh],
  );

  const addTopicToFolder = useCallback(
    async (folderId: string, topicSearchId: string) => {
      const res = await fetch(`/api/research/folders/${folderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_search_id: topicSearchId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Could not add to folder');
      }
      await refresh();
    },
    [refresh],
  );

  const removeTopicFromFolder = useCallback(async (folderId: string, topicSearchId: string) => {
    const params = new URLSearchParams({ topic_search_id: topicSearchId });
    const res = await fetch(`/api/research/folders/${folderId}/items?${params}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Could not remove from folder');
    }
    await refresh();
  }, [refresh]);

  return { folders, loading, refresh, createFolder, addTopicToFolder, removeTopicFromFolder };
}
