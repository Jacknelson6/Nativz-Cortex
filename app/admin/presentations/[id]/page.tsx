'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import type { ClientOption } from '@/components/ui/client-picker';
import type { PresentationData } from './types';
import { SlideEditor } from './slide-editor';
import { TierListEditor } from './tier-list-editor';
import { SocialAuditEditor } from './social-audit-editor';
import { BenchmarksEditor } from './benchmarks-editor';
import { ProspectAuditEditor } from './prospect-audit-editor';
import { SocialResultsEditor } from './social-results-editor';

// ─── Router page ─────────────────────────────────────────────────────────────

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
            slides: data.slides,
            tiers: data.tiers,
            tier_items: data.tier_items,
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
          slides: presentation.slides,
          tiers: presentation.tiers,
          tier_items: presentation.tier_items,
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

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 rounded bg-surface-hover animate-pulse" />
        <div className="h-[600px] rounded-xl bg-surface-hover animate-pulse" />
      </div>
    );
  }

  if (!presentation) return null;

  if (presentation.type === 'benchmarks') {
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

  if (presentation.type === 'prospect_audit') {
    return (
      <ProspectAuditEditor
        presentation={presentation}
        saving={saving}
        clients={clients}
        update={update}
        onSave={handleManualSave}
        onBack={() => router.push('/admin/presentations')}
      />
    );
  }

  if (presentation.type === 'social_audit') {
    return (
      <SocialAuditEditor
        presentation={presentation}
        saving={saving}
        clients={clients}
        update={update}
        onSave={handleManualSave}
        onBack={() => router.push('/admin/presentations')}
      />
    );
  }

  if (presentation.type === 'social_results') {
    return (
      <SocialResultsEditor
        presentation={presentation}
        saving={saving}
        clients={clients}
        update={update}
        onSave={handleManualSave}
        onBack={() => router.push('/admin/presentations')}
      />
    );
  }

  if (presentation.type === 'tier_list') {
    return (
      <TierListEditor
        presentation={presentation}
        saving={saving}
        clients={clients}
        update={update}
        onSave={handleManualSave}
        onBack={() => router.push('/admin/presentations')}
      />
    );
  }

  return (
    <SlideEditor
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
