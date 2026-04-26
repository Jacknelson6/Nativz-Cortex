'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link as LinkIcon, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';

interface IdeasWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onStarted?: (item: { id: string; concept: string | null; clientName: string | null }) => void;
}

type SourceMode = 'client' | 'url';
const COUNT_PRESETS = [5, 10, 15, 20] as const;

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function IdeasWizard({ open, onClose, clients, onStarted }: IdeasWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sourceMode, setSourceMode] = useState<SourceMode>('client');
  const [clientId, setClientId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [customCount, setCustomCount] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canProceed = sourceMode === 'client' ? !!clientId : isValidUrl(sourceUrl);

  function reset() {
    setStep(1);
    setSourceMode('client');
    setClientId(null);
    setSourceUrl('');
    setConcept('');
    setCount(10);
    setCustomCount('');
    setReferenceUrl('');
    setReferenceIds([]);
    setLoading(false);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function addReference() {
    if (!referenceUrl.trim() || !clientId) return;
    try {
      const res = await fetch('/api/reference-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, url: referenceUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setReferenceIds((prev) => [...prev, data.id]);
        setReferenceUrl('');
      }
    } catch {
      // Reference videos are optional
    }
  }

  async function handleGenerate(overrides?: { concept?: string; count?: number; referenceIds?: string[] }) {
    if (!canProceed) return;
    setError('');
    setLoading(true);

    const finalConcept = overrides?.concept ?? concept;
    const finalCount = overrides?.count ?? count;
    const finalRefs = overrides?.referenceIds ?? referenceIds;

    try {
      const body: Record<string, unknown> = {
        concept: finalConcept.trim() || undefined,
        count: finalCount,
      };

      if (sourceMode === 'client') {
        body.client_id = clientId;
        if (finalRefs.length > 0) body.reference_video_ids = finalRefs;
      } else {
        body.url = sourceUrl.trim();
      }

      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        return;
      }

      // Notify parent about the new processing item
      const clientName = clientId ? clients.find((c) => c.id === clientId)?.name ?? null : sourceUrl.trim();
      onStarted?.({
        id: data.id,
        concept: finalConcept.trim() || null,
        clientName,
      });

      toast.success('Generating ideas in the background');
      handleClose();
      router.push(`/admin/ideas/${data.id}`);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCustomCountChange(val: string) {
    setCustomCount(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= 50) {
      setCount(num);
    }
  }

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="var(--accent2)"
      totalSteps={2}
      currentStep={step}
    >
      {/* Step 1: Select client or paste URL */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Who are the ideas for?</h2>
        <p className="text-sm text-text-muted mb-5">Select a client or paste a website URL to scrape</p>

        {/* Mode toggle */}
        <div className="flex bg-white/[0.04] rounded-lg p-0.5 gap-0.5 mb-4">
          <button
            type="button"
            onClick={() => { setSourceMode('client'); setSourceUrl(''); }}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              sourceMode === 'client'
                ? 'bg-white/[0.08] text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Client
          </button>
          <button
            type="button"
            onClick={() => { setSourceMode('url'); setClientId(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              sourceMode === 'url'
                ? 'bg-white/[0.08] text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Globe size={14} />
            Website URL
          </button>
        </div>

        {sourceMode === 'client' ? (
          <ClientPickerButton
            clients={clients}
            value={clientId}
            onChange={setClientId}
          />
        ) : (
          <div>
            <div className="relative">
              <LinkIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent2/50 focus:outline-none focus-visible:outline-none focus:ring-1 focus:ring-accent2/50"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} disabled={!canProceed} className="!text-accent2-text !bg-[var(--accent2-surface)] !border-[var(--accent2-ring)] hover:!bg-[var(--accent2-ring)] hover:!border-[var(--accent2-ring)] hover:!shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_20px_var(--accent2-surface)] active:!bg-[var(--accent2-ring)] focus-visible:!ring-accent2">
            Next &rarr;
          </GlassButton>
        </div>
      </div>

      {/* Step 2: Shape ideas (all optional) */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Shape your ideas</h2>
        <p className="text-sm text-text-muted mb-5">Optional — skip to generate with defaults</p>

        {/* Concept */}
        <label className="text-xs text-text-muted mb-1.5 block">Concept or direction</label>
        <input
          type="text"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder='e.g. "franchise growth", "behind the scenes"'
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 px-4 text-sm text-white placeholder-white/40 focus:border-accent2/50 focus:outline-none focus-visible:outline-none focus:ring-1 focus:ring-accent2/50 mb-4"
        />

        {/* Count presets + custom input */}
        <label className="text-xs text-text-muted mb-1.5 block">How many ideas?</label>
        <div className="flex items-center gap-2 mb-4">
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setCount(n); setCustomCount(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                count === n && !customCount
                  ? 'bg-accent2-surface text-accent2-text'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={50}
            value={customCount}
            onChange={(e) => handleCustomCountChange(e.target.value)}
            placeholder="#"
            className={`w-16 px-3 py-2 rounded-lg text-sm font-medium text-center transition-colors focus:outline-none ${
              customCount
                ? 'bg-accent2-surface text-accent2-text border border-accent2/30'
                : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
            }`}
          />
        </div>

        {/* Reference video URL — only for client mode */}
        {sourceMode === 'client' && (
          <>
            <label className="text-xs text-text-muted mb-1.5 block">Reference video</label>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="url"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="Paste a video URL"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-accent2/50 focus:outline-none focus-visible:outline-none focus:ring-1 focus:ring-accent2/50"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReference(); } }}
                />
              </div>
              <button
                type="button"
                onClick={addReference}
                disabled={!referenceUrl.trim()}
                className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-text-muted hover:bg-white/[0.1] transition-colors disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {referenceIds.length > 0 && (
              <p className="text-xs text-text-muted mb-4">{referenceIds.length} reference{referenceIds.length !== 1 ? 's' : ''} added</p>
            )}
          </>
        )}

        {/* URL mode note */}
        {sourceMode === 'url' && (
          <p className="text-xs text-accent2-text/70 mb-4">
            Scraping may take a few seconds — we&apos;ll analyze the site before generating ideas
          </p>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-between mt-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            &larr; Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleGenerate({ concept: '', count: 10, referenceIds: [] })}
              disabled={loading}
              className="rounded-xl border border-accent2/30 px-5 py-2.5 text-sm font-medium text-accent2-text hover:bg-accent2-surface transition-colors disabled:opacity-40"
            >
              Skip &amp; generate
            </button>
            <GlassButton onClick={() => handleGenerate()} loading={loading} disabled={loading} className="!bg-[var(--accent2-surface)] !border-[var(--accent2-ring)] !text-accent2-text hover:!bg-[var(--accent2-ring)]">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : error ? 'Retry' : 'Generate'}
            </GlassButton>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
