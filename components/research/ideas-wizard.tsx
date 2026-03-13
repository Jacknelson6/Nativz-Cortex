'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';

interface IdeasWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
}

const COUNT_PRESETS = [5, 10, 15, 20] as const;

export function IdeasWizard({ open, onClose, clients }: IdeasWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState<string | null>(null);
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setStep(1);
    setClientId(null);
    setConcept('');
    setCount(10);
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
    if (!clientId) return;
    setError('');
    setLoading(true);

    const finalConcept = overrides?.concept ?? concept;
    const finalCount = overrides?.count ?? count;
    const finalRefs = overrides?.referenceIds ?? referenceIds;

    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          concept: finalConcept.trim() || undefined,
          count: finalCount,
          reference_video_ids: finalRefs.length > 0 ? finalRefs : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        setLoading(false);
        return;
      }

      toast.success(`${data.ideas?.length ?? count} ideas generated`);
      handleClose();
      router.push(`/admin/ideas/${data.id}`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="#eab308"
      totalSteps={2}
      currentStep={step}
    >
      {/* Step 1: Select client */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Who are the ideas for?</h2>
        <p className="text-sm text-text-muted mb-5">Select a client to generate ideas for</p>

        <ClientPickerButton
          clients={clients}
          value={clientId}
          onChange={setClientId}
        />

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} disabled={!clientId}>
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
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 px-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none mb-4"
        />

        {/* Count presets */}
        <label className="text-xs text-text-muted mb-1.5 block">How many ideas?</label>
        <div className="flex gap-2 mb-4">
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                count === n
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Reference video URL */}
        <label className="text-xs text-text-muted mb-1.5 block">Reference video</label>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="Paste a video URL"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
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
              className="rounded-xl border border-yellow-500/30 px-5 py-2.5 text-sm font-medium text-yellow-400 hover:bg-yellow-500/10 transition-colors disabled:opacity-40"
            >
              Skip &amp; generate
            </button>
            <GlassButton onClick={() => handleGenerate()} loading={loading} disabled={loading} className="!bg-[rgba(234,179,8,0.12)] !border-[rgba(234,179,8,0.25)] !text-yellow-400 hover:!bg-[rgba(234,179,8,0.2)]">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : error ? 'Retry' : 'Generate'}
            </GlassButton>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
