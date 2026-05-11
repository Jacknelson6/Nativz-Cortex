'use client';

// VFF-09 T12: 4-button action bar for the detail pane.
// Optimistic local-state toggle with rollback on error. Toast on each
// success. Save toggles per-user; Pin + Dismiss require a brand and
// disable when none is active.

import { useCallback, useState } from 'react';
import { Bookmark, Pin, Ban, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  video_id: string;
  client_id: string | null;
  initial: { is_saved: boolean; is_pinned: boolean; is_dismissed: boolean };
  brand_name: string | null;
};

export function FormatActionBar({ video_id, client_id, initial, brand_name }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const brandLabel = brand_name ?? "this brand";

  const apiCall = useCallback(
    async (action: 'save' | 'pin' | 'dismiss', method: 'POST' | 'DELETE', body?: object) => {
      const res = await fetch(`/api/admin/formats/${video_id}/${action}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `${action} failed`);
      }
      return res.json() as Promise<Record<string, unknown>>;
    },
    [video_id],
  );

  const toggleSave = useCallback(async () => {
    const next = !state.is_saved;
    setPending('save');
    setState((s) => ({ ...s, is_saved: next }));
    try {
      await apiCall('save', next ? 'POST' : 'DELETE');
      toast.success(next ? 'Saved to your library.' : 'Removed from your saved.');
    } catch (err) {
      setState((s) => ({ ...s, is_saved: !next }));
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setPending(null);
    }
  }, [state.is_saved, apiCall]);

  const togglePin = useCallback(async () => {
    if (!client_id) {
      toast.error('Pick an active brand first.');
      return;
    }
    const next = !state.is_pinned;
    setPending('pin');
    setState((s) => ({ ...s, is_pinned: next }));
    try {
      await apiCall('pin', next ? 'POST' : 'DELETE', { client_id });
      toast.success(next ? `Pinned to ${brandLabel}'s library.` : 'Unpinned.');
    } catch (err) {
      setState((s) => ({ ...s, is_pinned: !next }));
      toast.error(err instanceof Error ? err.message : 'Could not pin');
    } finally {
      setPending(null);
    }
  }, [client_id, state.is_pinned, apiCall, brandLabel]);

  const toggleDismiss = useCallback(async () => {
    if (!client_id) {
      toast.error('Pick an active brand first.');
      return;
    }
    const next = !state.is_dismissed;
    setPending('dismiss');
    setState((s) => ({ ...s, is_dismissed: next }));
    try {
      await apiCall('dismiss', next ? 'POST' : 'DELETE', { client_id });
      toast.success(
        next
          ? 'Demoted for this brand. We will show it less.'
          : 'Restored. Back in rotation.',
      );
    } catch (err) {
      setState((s) => ({ ...s, is_dismissed: !next }));
      toast.error(err instanceof Error ? err.message : 'Could not dismiss');
    } finally {
      setPending(null);
    }
  }, [client_id, state.is_dismissed, apiCall]);

  const useFormat = useCallback(async () => {
    if (!client_id) {
      toast.error('Pick an active brand first.');
      return;
    }
    setPending('use');
    try {
      const res = await fetch(`/api/admin/formats/${video_id}/use-in-content-lab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? 'Could not open Content Lab');
      }
      const json = (await res.json()) as { conversation_id: string; redirect_url: string };
      toast.success('Opened in Content Lab with format pinned.');
      router.push(json.redirect_url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open Content Lab. Try again.');
    } finally {
      setPending(null);
    }
  }, [client_id, video_id, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" size="sm" onClick={useFormat} disabled={pending !== null}>
        <Sparkles size={14} />
        Use this format
      </Button>
      <Button variant={state.is_saved ? 'secondary' : 'outline'} size="sm" onClick={toggleSave} disabled={pending !== null}>
        <Bookmark size={14} />
        {state.is_saved ? 'Saved' : 'Save'}
      </Button>
      <Button
        variant={state.is_pinned ? 'secondary' : 'outline'}
        size="sm"
        onClick={togglePin}
        disabled={pending !== null || !client_id}
      >
        <Pin size={14} />
        {state.is_pinned ? 'Pinned' : 'Pin to brand'}
      </Button>
      <Button
        variant={state.is_dismissed ? 'secondary' : 'ghost'}
        size="sm"
        onClick={toggleDismiss}
        disabled={pending !== null || !client_id}
      >
        <Ban size={14} />
        {state.is_dismissed ? 'Restored' : 'Not for this brand'}
      </Button>
    </div>
  );
}
