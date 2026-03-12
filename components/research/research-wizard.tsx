'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search, Link as LinkIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';

interface ResearchWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onStarted?: (item: { id: string; query: string; mode: string; clientName: string | null }) => void;
}

export function ResearchWizard({ open, onClose, clients, onStarted }: ResearchWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'client_strategy' | 'general'>('client_strategy');
  const [clientId, setClientId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'client' | 'url'>('client');
  const [url, setUrl] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedClient = clients.find((c) => c.id === clientId);
  const isBrand = mode === 'client_strategy';

  const step1Valid = isBrand
    ? (inputMode === 'client' ? !!clientId : url.trim().length > 0)
    : topicQuery.trim().length > 0;

  function reset() {
    setStep(1);
    setMode('client_strategy');
    setClientId(null);
    setInputMode('client');
    setUrl('');
    setTopicQuery('');
    setLoading(false);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);

    try {
      const query = isBrand
        ? (inputMode === 'client' ? selectedClient?.name ?? '' : url.trim())
        : topicQuery.trim();

      const body = {
        query,
        source: 'all',
        time_range: 'last_3_months',
        language: 'all',
        country: 'us',
        client_id: isBrand && inputMode === 'client' ? clientId : null,
        search_mode: mode,
      };

      const res = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Search failed');
        setLoading(false);
        return;
      }

      // Kick off processing (fire and forget)
      fetch(`/api/search/${data.id}/process`, { method: 'POST' }).catch(() => {});

      toast.success('Research started');
      onStarted?.({
        id: data.id,
        query,
        mode,
        clientName: selectedClient?.name ?? null,
      });
      handleClose();
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  const summaryLabel = isBrand
    ? (inputMode === 'client' ? `Analyzing ${selectedClient?.name}` : `Analyzing ${url}`)
    : `Researching "${topicQuery}"`;

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="#5ba3e6"
      totalSteps={2}
      currentStep={step}
    >
      {/* Step 1: Mode + target */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">What would you like to research?</h2>
        <p className="text-sm text-text-muted mb-5">Choose a mode to get started</p>

        {/* Toggle */}
        <div className="flex bg-white/[0.04] rounded-lg p-1 mb-4">
          <button
            type="button"
            onClick={() => setMode('client_strategy')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              isBrand ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Brand intel
          </button>
          <button
            type="button"
            onClick={() => setMode('general')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              !isBrand ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Topic research
          </button>
        </div>

        {isBrand ? (
          <>
            {inputMode === 'client' ? (
              <>
                <ClientPickerButton
                  clients={clients}
                  value={clientId}
                  onChange={(id) => { setClientId(id); setUrl(''); }}
                />
                <button
                  type="button"
                  onClick={() => { setInputMode('url'); setClientId(null); }}
                  className="mt-2 block mx-auto text-xs text-accent-text/70 hover:text-accent-text transition-colors"
                >
                  or paste a link instead
                </button>
              </>
            ) : (
              <>
                <div className="relative">
                  <LinkIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setInputMode('client'); setUrl(''); }}
                  className="mt-2 block mx-auto text-xs text-accent-text/70 hover:text-accent-text transition-colors"
                >
                  or select a client
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={topicQuery}
                onChange={(e) => setTopicQuery(e.target.value)}
                placeholder="Search a topic..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
                autoFocus
              />
            </div>
            <ClientPickerButton
              clients={clients}
              value={clientId}
              onChange={setClientId}
              placeholder="Attach to a client (optional)"
            />
          </>
        )}

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} disabled={!step1Valid}>
            Next &rarr;
          </GlassButton>
        </div>
      </div>

      {/* Step 2: Confirm + run */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Ready to go</h2>
        <p className="text-sm text-text-muted mb-6">{summaryLabel}</p>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-surface">
              {isBrand ? <Building2 size={18} className="text-accent-text" /> : <Search size={18} className="text-accent-text" />}
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {isBrand ? (inputMode === 'client' ? selectedClient?.name : url) : topicQuery}
              </p>
              <p className="text-xs text-text-muted">
                {isBrand ? 'Brand intelligence analysis' : 'Topic research'}
                {clientId && !isBrand && selectedClient ? ` · ${selectedClient.name}` : ''}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            &larr; Back
          </button>
          <GlassButton onClick={handleSubmit} loading={loading} disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Running...</> : 'Run research'}
          </GlassButton>
        </div>
      </div>
    </WizardShell>
  );
}
