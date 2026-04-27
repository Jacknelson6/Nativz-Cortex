'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles, Loader2, Upload, Link2, Trash2,
  Minus, Plus, X, Check, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ComboSelect } from '@/components/ui/combo-select';
import { Badge } from '@/components/ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
}

interface ReferenceVideo {
  id?: string;
  url?: string;
  file?: File;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis?: Record<string, unknown>;
}

interface IdeaGeneratorProps {
  clients: Client[];
  onIdeasSaved: () => void;
  initialSearchId?: string | null;
  initialSearchQuery?: string | null;
}

// ── Count Selector ──────────────────────────────────────────────────────────

function CountSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const presets = [5, 10, 15, 20];

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-text-secondary"># of ideas</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Minus size={14} />
        </button>
        <div className="flex items-center gap-1">
          {presets.map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`h-9 min-w-[2.25rem] rounded-lg px-2 text-sm font-medium transition-all cursor-pointer ${
                value === n
                  ? 'bg-accent2 text-white shadow-sm'
                  : 'border border-nativz-border bg-surface text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() => onChange(Math.min(50, value + 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Plus size={14} />
        </button>
        {!presets.includes(value) && (
          <span className="ml-1 text-sm font-medium text-accent2-text tabular-nums">{value}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Generator ──────────────────────────────────────────────────────────

export function IdeaGenerator({ clients, onIdeasSaved, initialSearchId, initialSearchQuery }: IdeaGeneratorProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [referenceVideos, setReferenceVideos] = useState<ReferenceVideo[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [processingRefs, setProcessingRefs] = useState(false);

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const selectedClient = clients.find((c) => c.id === clientId);
  const completedRefIds = referenceVideos
    .filter((v) => v.status === 'completed' && v.id)
    .map((v) => v.id!);

  // ── Add reference video by URL ──
  const addReferenceUrl = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    setReferenceVideos((prev) => [...prev, { url, title: url.split('/').pop() ?? 'Video', status: 'pending' }]);
    setUrlInput('');
  }, [urlInput]);

  // ── Add reference video by file ──
  const addReferenceFile = useCallback((files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/')) {
        toast.error(`${file.name} is not a video file`);
        continue;
      }
      setReferenceVideos((prev) => [...prev, { file, title: file.name, status: 'pending' }]);
    }
  }, []);

  // ── Process reference videos ──
  const processReferences = useCallback(async () => {
    if (!clientId || referenceVideos.length === 0) return;
    setProcessingRefs(true);

    const updated = [...referenceVideos];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'pending') continue;
      updated[i] = { ...updated[i], status: 'processing' };
      setReferenceVideos([...updated]);

      try {
        const createRes = await fetch('/api/reference-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            url: updated[i].url ?? null,
            title: updated[i].title,
          }),
        });
        if (!createRes.ok) throw new Error('Failed to create reference');
        const { video } = await createRes.json();

        const processRes = await fetch(`/api/reference-videos/${video.id}/process`, {
          method: 'POST',
        });
        if (!processRes.ok) throw new Error('Processing failed');
        const { video: processed } = await processRes.json();

        updated[i] = {
          ...updated[i],
          id: processed.id,
          status: processed.status,
          analysis: processed.visual_analysis,
        };
      } catch {
        updated[i] = { ...updated[i], status: 'failed' };
      }
      setReferenceVideos([...updated]);
    }
    setProcessingRefs(false);
  }, [clientId, referenceVideos]);

  // ── Generate ideas ──
  const handleGenerate = useCallback(async () => {
    if (!clientId) return;

    const hasPending = referenceVideos.some((v) => v.status === 'pending');
    if (hasPending) {
      await processReferences();
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          concept: concept.trim() || undefined,
          count,
          reference_video_ids: completedRefIds.length > 0 ? completedRefIds : undefined,
          search_id: initialSearchId ?? undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(d.error ?? 'Failed to generate ideas');
      }

      const data = await res.json();
      // Redirect to results page
      router.push(`/admin/ideas/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate ideas');
      setGenerating(false);
    }
  }, [clientId, concept, count, referenceVideos, completedRefIds, processReferences, initialSearchId, router]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent2-surface">
            <Sparkles size={24} className="text-accent2-text" />
          </div>
        </div>
        <h1 className="ui-page-title">Generate video ideas</h1>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          AI-powered ideas from brand context, strategy, and optional reference videos
        </p>
        {initialSearchQuery && (
          <Badge variant="purple" className="mt-2">
            <Search size={11} className="mr-1" />
            Using research: {initialSearchQuery}
          </Badge>
        )}
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-5">
        {/* Client + Count row */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
          <ComboSelect
            label="Client"
            options={clientOptions}
            value={clientId}
            onChange={setClientId}
            placeholder="Search clients…"
            searchable
            accent="purple"
          />
          <CountSelector value={count} onChange={setCount} />
        </div>

        {/* Concept direction */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Concept direction <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && clientId && !generating) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="e.g. summer fitness tips, behind the scenes, product launches…"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
          />
        </div>

        {/* Reference videos */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text-secondary">
            Reference videos <span className="text-text-muted font-normal">(optional)</span>
          </label>

          {/* URL input */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
              <Link2 size={14} className="text-text-muted shrink-0" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addReferenceUrl(); }
                }}
                placeholder="Paste a video URL (YouTube, TikTok, Instagram…)"
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addReferenceUrl}
              disabled={!urlInput.trim()}
            >
              Add
            </Button>
          </div>

          {/* File upload */}
          <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-nativz-border/60 bg-background px-4 py-3 text-xs text-text-muted hover:border-accent2/40 hover:text-text-secondary transition-colors cursor-pointer">
            <Upload size={14} />
            Drop or click to upload video files
            <input
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => addReferenceFile(e.target.files)}
            />
          </label>

          {/* Added references list */}
          {referenceVideos.length > 0 && (
            <div className="space-y-1.5">
              {referenceVideos.map((ref, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2"
                >
                  {ref.status === 'processing' && <Loader2 size={12} className="animate-spin text-accent2-text shrink-0" />}
                  {ref.status === 'completed' && <Check size={12} className="text-emerald-400 shrink-0" />}
                  {ref.status === 'failed' && <X size={12} className="text-red-400 shrink-0" />}
                  {ref.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-nativz-border shrink-0" />}
                  <span className="text-xs text-text-secondary truncate flex-1">{ref.title}</span>
                  <button
                    onClick={() => setReferenceVideos((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1 rounded text-text-muted hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate button */}
        <div className="flex items-center justify-center pt-2">
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={generating || processingRefs || !clientId}
            className="bg-accent2 text-white hover:bg-accent2/90"
          >
            {generating || processingRefs ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {processingRefs ? 'Processing references…' : 'Generating…'}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate ideas
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
