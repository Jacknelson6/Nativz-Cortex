'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowLeft, Loader2, Link2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ComboSelect } from '@/components/ui/combo-select';
import { PathSelector } from './path-selector';
import { PillarGenerator } from './pillar-generator';
import { PillarIdeaConfig } from './pillar-idea-config';
import { FullStrategyModal } from './full-strategy-modal';
import {
  ReferenceVideosField,
  processPendingReferenceVideos,
  completedReferenceVideoIds,
  type ReferenceVideoItem,
} from './reference-videos-field';
import type { Pillar } from './pillar-card';

interface ContentWizardProps {
  clients: { id: string; name: string }[];
  onIdeasSaved: () => void;
  initialSearchId?: string | null;
  initialSearchQuery?: string | null;
  initialClientId?: string | null;
  initialFocus?: 'pillars' | 'ideas' | 'pillar-ideas' | null;
}

function clientIsValid(clientId: string, clientList: { id: string }[]): boolean {
  return !!clientId && clientList.some((c) => c.id === clientId);
}

type WizardStep = 1 | 2 | 3;
type WizardPath = 'pillars' | 'ideas' | null;

export function ContentWizard({
  clients,
  onIdeasSaved,
  initialSearchId,
  initialClientId,
  initialFocus,
}: ContentWizardProps) {
  const validInitialClient =
    initialClientId && clientIsValid(initialClientId, clients) ? initialClientId : '';

  const [step, setStep] = useState<WizardStep>(() => {
    if (!validInitialClient) return 1;
    if (initialFocus === 'pillars' || initialFocus === 'ideas') return 2;
    if (initialFocus === 'pillar-ideas') return 2;
    return 1;
  });
  const [path, setPath] = useState<WizardPath>(() => {
    if (!validInitialClient) return null;
    if (initialFocus === 'pillars') return 'pillars';
    if (initialFocus === 'ideas') return 'ideas';
    if (initialFocus === 'pillar-ideas') return 'pillars';
    return null;
  });
  const [clientId, setClientId] = useState(validInitialClient);
  const [brandUrl, setBrandUrl] = useState('');
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [pillarIdeasLoading, setPillarIdeasLoading] = useState(
    () => initialFocus === 'pillar-ideas' && !!validInitialClient,
  );

  useEffect(() => {
    if (initialFocus !== 'pillar-ideas') return;
    if (!validInitialClient) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${validInitialClient}/pillars`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const list = (data.pillars ?? []) as Pillar[];
        if (cancelled) return;
        if (list.length === 0) {
          setPillars([]);
          setPath('pillars');
          setStep(2);
        } else {
          setPillars(list);
          setPath('pillars');
          setStep(3);
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not load pillars');
          setPath('pillars');
          setStep(2);
        }
      } finally {
        if (!cancelled) setPillarIdeasLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFocus, validInitialClient]);

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const selectedClient = clients.find((c) => c.id === clientId);
  const hasContext = !!clientId || !!brandUrl.trim();

  const handleSelectPath = (selected: 'pillars' | 'ideas') => {
    setPath(selected);
    setStep(2);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
      setPath(null);
    }
  };

  const stepLabels: Record<WizardStep, string> = {
    1: '',
    2: 'Choose path',
    3: 'Edit pillars',
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Header + client + path selection */}
      {step === 1 && !pillarIdeasLoading && (
        <>
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent2-surface">
                <Sparkles size={24} className="text-accent2-text" />
              </div>
            </div>
            <h1 className="ui-page-title">Create content</h1>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Generate content pillars and video ideas powered by AI brand context
            </p>
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="w-56">
                <ComboSelect
                  options={clientOptions}
                  value={clientId}
                  onChange={(v) => { setClientId(v); if (v) setBrandUrl(''); }}
                  placeholder="Select client..."
                  searchable
                  accent="purple"
                />
              </div>
              {!clientId && (
                <>
                  <span className="text-xs text-text-muted/50 uppercase tracking-wider">or paste url</span>
                  <div className="w-72">
                    <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
                      <Link2 size={14} className="text-text-muted shrink-0" />
                      <input
                        type="text"
                        value={brandUrl}
                        onChange={(e) => setBrandUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <PathSelector
            onSelectPath={handleSelectPath}
            onFullStrategy={() => setStrategyModalOpen(true)}
            disabled={!hasContext}
            hasClient={!!clientId}
          />

          {!hasContext && (
            <p className="text-center text-xs text-text-muted/60 pt-2">
              Select a client or paste a URL to get started
            </p>
          )}
        </>
      )}

      {/* Back button — steps 2+ */}
      {step > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            Back to {stepLabels[step]}
          </button>
          {selectedClient && (
            <span className="text-xs text-text-muted">
              {selectedClient.name}
            </span>
          )}
        </div>
      )}

      {/* Pillar-ideas deep link: load pillars then jump to config */}
      {pillarIdeasLoading && clientId && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-accent2-text" />
          <p className="text-sm text-text-muted">Loading your content pillars…</p>
        </div>
      )}

      {/* Step 2: Pillar generation */}
      {step === 2 && path === 'pillars' && clientId && !pillarIdeasLoading && (
        <PillarGenerator
          clientId={clientId}
          pillars={pillars}
          onPillarsChange={setPillars}
          onNext={() => setStep(3)}
        />
      )}

      {/* Step 2: Idea generation (no duplicate header/client) */}
      {step === 2 && path === 'ideas' && hasContext && (
        <IdeaConfigStep
          clientId={clientId}
          brandUrl={brandUrl}
          initialSearchId={initialSearchId}
          onIdeasStarted={onIdeasSaved}
        />
      )}

      {/* Step 3: Pillar → idea config */}
      {step === 3 && path === 'pillars' && clientId && !pillarIdeasLoading && (
        <PillarIdeaConfig
          clientId={clientId}
          pillars={pillars}
          initialSearchId={initialSearchId}
          onIdeasStarted={onIdeasSaved}
        />
      )}

      {/* Full strategy modal */}
      <FullStrategyModal
        open={strategyModalOpen}
        onClose={() => setStrategyModalOpen(false)}
        clients={clients}
      />
    </div>
  );
}

// ── Inline idea config (used as step 2 for "ideas" path) ────────────────────

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

function IdeaConfigStep({
  clientId,
  brandUrl,
  initialSearchId,
  onIdeasStarted,
}: {
  clientId: string;
  brandUrl?: string;
  initialSearchId?: string | null;
  onIdeasStarted?: () => void;
}) {
  const router = useRouter();
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [referenceVideos, setReferenceVideos] = useState<ReferenceVideoItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [processingRefs, setProcessingRefs] = useState(false);

  const completedRefIds = completedReferenceVideoIds(referenceVideos);

  const handleGenerate = useCallback(async () => {
    if (!clientId && !brandUrl?.trim()) return;
    const hasPendingUrl = referenceVideos.some((v) => v.status === 'pending' && v.url);
    let refIds = completedRefIds;
    if (hasPendingUrl && clientId) {
      setProcessingRefs(true);
      const finalItems = await processPendingReferenceVideos(clientId, referenceVideos, setReferenceVideos);
      setProcessingRefs(false);
      refIds = completedReferenceVideoIds(finalItems);
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || undefined,
          url: !clientId && brandUrl ? brandUrl.trim() : undefined,
          concept: concept.trim() || undefined,
          count,
          reference_video_ids: refIds.length > 0 ? refIds : undefined,
          search_id: initialSearchId ?? undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(d.error ?? 'Failed');
      }
      const data = await res.json();
      onIdeasStarted?.();
      router.push(`/admin/ideas/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate ideas');
      setGenerating(false);
    }
  }, [clientId, brandUrl, concept, count, referenceVideos, completedRefIds, initialSearchId, router, onIdeasStarted]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-text-primary">Generate video ideas</h2>
        <p className="text-sm text-text-secondary">Configure and generate AI-powered video ideas</p>
      </div>

      <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-5">
        {/* Count */}
        <CountSelector value={count} onChange={setCount} />

        {/* Concept */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Concept direction <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating) { e.preventDefault(); handleGenerate(); }
            }}
            placeholder="e.g. summer fitness tips, behind the scenes, product launches…"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus-visible:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
          />
        </div>

        <ReferenceVideosField
          items={referenceVideos}
          setItems={setReferenceVideos}
          disabled={generating || processingRefs}
        />

        {/* Generate */}
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={handleGenerate}
            disabled={generating || processingRefs}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent2 px-8 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {generating || processingRefs ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {processingRefs ? 'Processing references…' : 'Generating…'}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate {count} ideas
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
