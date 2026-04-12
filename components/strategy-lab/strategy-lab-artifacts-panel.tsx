'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  FlaskConical,
  Lightbulb,
  Workflow,
  Sparkles,
  Trash2,
  FileDown,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { Markdown } from '@/components/ai/markdown';
import type { ArtifactType, NerdArtifact } from '@/lib/artifacts/types';
import type { AgencyBrand } from '@/lib/agency/detect';

const TYPE_CONFIG: Record<ArtifactType, { label: string; icon: React.ReactNode; color: string }> = {
  script: { label: 'Script', icon: <FileText size={12} />, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  plan: { label: 'Plan', icon: <Workflow size={12} />, color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  diagram: { label: 'Diagram', icon: <FlaskConical size={12} />, color: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  ideas: { label: 'Ideas', icon: <Lightbulb size={12} />, color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  hook: { label: 'Hook', icon: <Sparkles size={12} />, color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  strategy: { label: 'Strategy', icon: <BookOpen size={12} />, color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  general: { label: 'General', icon: <FileText size={12} />, color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20' },
};

function TypeBadge({ type }: { type: ArtifactType }) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.general;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', config.color)}>
      {config.icon}
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ArtifactsPanelProps {
  clientId: string;
  clientName?: string;
  agency?: AgencyBrand;
}

export function StrategyLabArtifactsPanel({ clientId, clientName, agency }: ArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<NerdArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<NerdArtifact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const loadArtifacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/nerd/artifacts?client_id=${clientId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/nerd/artifacts/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedArtifact(data);
      }
    } catch {
      toast.error('Failed to load artifact');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/nerd/artifacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setArtifacts((prev) => prev.filter((a) => a.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setSelectedArtifact(null);
        }
        toast.success('Artifact deleted');
      }
    } catch {
      toast.error('Failed to delete');
    }
  }, [selectedId]);

  const handleExportPdf = useCallback(async () => {
    if (!selectedArtifact) return;
    setPdfBusy(true);
    try {
      const [rendererModule, docModule] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./strategy-lab-artifact-pdf'),
      ]);
      const { pdf } = rendererModule;
      const { StrategyLabArtifactPdf } = docModule;

      const blob = await pdf(
        StrategyLabArtifactPdf({
          agency: agency ?? 'nativz',
          clientName: clientName ?? 'Client',
          clientLogoDataUrl: null,
          title: selectedArtifact.title,
          content: selectedArtifact.content,
          artifactType: selectedArtifact.artifact_type as ArtifactType,
          createdAt: selectedArtifact.created_at,
        }),
      ).toBlob();

      const safeName = selectedArtifact.title.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Artifact PDF exported');
    } catch (err) {
      console.error('Artifact PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setPdfBusy(false);
    }
  }, [selectedArtifact, agency, clientName]);

  // Detail view
  if (selectedId && selectedArtifact) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
          <button
            type="button"
            onClick={() => { setSelectedId(null); setSelectedArtifact(null); }}
            className="text-xs font-medium text-accent-text hover:underline"
          >
            Back to artifacts
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={pdfBusy}
              className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
              title="Export as PDF"
            >
              {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(selectedArtifact.id)}
              className="rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Delete artifact"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-3 flex items-center gap-2">
            <TypeBadge type={selectedArtifact.artifact_type as ArtifactType} />
            <span className="text-[10px] text-text-muted">{formatDate(selectedArtifact.created_at)}</span>
          </div>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">{selectedArtifact.title}</h2>
          <div id="artifact-detail-content" className="text-text-secondary">
            <Markdown content={selectedArtifact.content} />
          </div>
        </div>
      </div>
    );
  }

  // Loading detail
  if (selectedId && detailLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    );
  }

  // List view
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-nativz-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Saved artifacts</h3>
        <p className="text-[10px] text-text-muted mt-0.5">
          {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : artifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-hover/60">
              <BookOpen size={18} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-secondary">No artifacts yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Click the bookmark icon on any Nerd response to save it here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-nativz-border/30">
            {artifacts.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => loadDetail(art.id)}
                className="w-full px-4 py-3 text-left transition hover:bg-surface-hover/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{art.title}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <TypeBadge type={art.artifact_type as ArtifactType} />
                      <span className="text-[10px] text-text-muted">{formatDate(art.created_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(art.id); }}
                    className="rounded p-1 text-text-muted opacity-0 transition group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
