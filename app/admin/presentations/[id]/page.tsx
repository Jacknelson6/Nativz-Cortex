'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import type { ClientOption } from '@/components/ui/client-picker';
import type { PresentationData } from './types';
import { BenchmarksEditor } from './benchmarks-editor';

export default function PresentationEditorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchPresentation = useCallback(async () => {
    try {
      const res = await fetch(`/api/presentations/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPresentation(data);
    } catch {
      toast.error('Failed to load presentation');
      router.push('/admin/presentations');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchPresentation();
    fetch('/api/clients').then((r) => r.json()).then(setClients).catch(() => {});
  }, [fetchPresentation]);

  const autoSave = useCallback(async (data: PresentationData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/presentations/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: data.title,
            description: data.description,
            client_id: data.client_id,
            audit_data: data.audit_data,
            status: data.status,
            tags: data.tags,
          }),
        });
      } catch {
        toast.error('Failed to save');
      } finally {
        setSaving(false);
      }
    }, 1000);
  }, [id]);

  function update(partial: Partial<PresentationData>) {
    if (!presentation) return;
    const updated = { ...presentation, ...partial };
    setPresentation(updated);
    autoSave(updated);
  }

  async function handleManualSave() {
    if (!presentation) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaving(true);
    try {
      await fetch(`/api/presentations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: presentation.title,
          description: presentation.description,
          client_id: presentation.client_id,
          audit_data: presentation.audit_data,
          status: presentation.status,
          tags: presentation.tags,
        }),
      });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!presentation || presentation.type === 'benchmarks') return;
    toast.error('This presentation type is no longer supported.');
    router.replace('/admin/presentations');
  }, [presentation, router]);

  if (loading) {
    return (
      <div className="cortex-page-gutter space-y-4">
        <div className="h-8 w-48 rounded bg-surface-hover animate-pulse" />
        <div className="h-[600px] rounded-xl bg-surface-hover animate-pulse" />
      </div>
    );
  }

  if (!presentation) return null;

  if (presentation.type !== 'benchmarks') {
    return (
      <div className="cortex-page-gutter flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-text-muted">Redirecting…</p>
      </div>
    );
  }

  return (
    <BenchmarksEditor
      presentation={presentation}
      saving={saving}
      clients={clients}
      update={update}
      onSave={handleManualSave}
      onBack={() => router.push('/admin/presentations')}
      onPresent={() => router.push(`/admin/presentations/${id}/present`)}
    />
  );
}
