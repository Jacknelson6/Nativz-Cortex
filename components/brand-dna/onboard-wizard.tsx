'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, Loader2, Upload, X, Check, ArrowLeft,
  Palette, Type, ShoppingBag, Users, Target, FileText, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from '@/components/research/wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import { BrandDNACards } from './brand-dna-cards';
import { BrandDNAProgress } from './brand-dna-progress';

interface OnboardWizardProps {
  open: boolean;
  onClose: () => void;
  /** If provided, we're generating for an existing client (not creating new) */
  existingClientId?: string;
  existingClientName?: string;
}

export function OnboardWizard({ open, onClose, existingClientId, existingClientName }: OnboardWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [clientName, setClientName] = useState(existingClientName ?? '');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState(existingClientId ?? '');
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');
  const [brandDNA, setBrandDNA] = useState<Record<string, unknown> | null>(null);

  const isUrlValid = /^https?:\/\/.+\..+/.test(websiteUrl.trim());
  const step1Valid = clientName.trim().length > 0 && isUrlValid;

  function reset() {
    setStep(1);
    setClientName(existingClientName ?? '');
    setWebsiteUrl('');
    setUploadedFiles([]);
    setLoading(false);
    setClientId(existingClientId ?? '');
    setJobId('');
    setError('');
    setBrandDNA(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function removeFile(idx: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const handleStartAnalysis = useCallback(async () => {
    setError('');
    setLoading(true);

    try {
      let id = clientId;

      // Create client if new
      if (!id) {
        const createRes = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: clientName.trim(),
            website_url: websiteUrl.trim(),
            onboarded_via: 'brand_dna',
          }),
        });
        if (!createRes.ok) {
          const d = await createRes.json().catch(() => ({}));
          throw new Error(d.error ?? 'Failed to create client');
        }
        const clientData = await createRes.json();
        id = clientData.id ?? clientData.client?.id;
        setClientId(id);
      }

      // Upload files if any
      let uploadedContent = '';
      if (uploadedFiles.length > 0) {
        const formData = new FormData();
        for (const file of uploadedFiles) {
          formData.append('files', file);
        }
        const uploadRes = await fetch(`/api/clients/${id}/brand-dna/upload`, {
          method: 'POST',
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedContent = uploadData.textContent ?? '';
        }
      }

      // Start generation
      const genRes = await fetch(`/api/clients/${id}/brand-dna/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim(),
          uploadedContent: uploadedContent || undefined,
        }),
      });

      if (!genRes.ok) {
        const d = await genRes.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to start generation');
      }

      const genData = await genRes.json();
      setJobId(genData.jobId);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [clientId, clientName, websiteUrl, uploadedFiles]);

  const handleGenerationComplete = useCallback(async () => {
    // Fetch the generated Brand DNA
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-dna`);
      if (res.ok) {
        const data = await res.json();
        setBrandDNA(data);
      }
    } catch {
      // Non-fatal
    }
    setStep(3);
  }, [clientId]);

  const handleConfirm = useCallback(async () => {
    // Update client status to active
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_dna_status: 'active' }),
      });
      toast.success('Brand DNA activated');
      handleClose();
      router.push(`/admin/clients`);
      router.refresh();
    } catch {
      toast.error('Failed to activate Brand DNA');
    }
  }, [clientId, router, handleClose]);

  const totalSteps = existingClientId ? 3 : 4;
  const displayStep = existingClientId ? step : step;

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="var(--accent)"
      totalSteps={totalSteps}
      currentStep={displayStep}
    >
      {/* Step 1: URL + name */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          {existingClientId ? 'Generate Brand DNA' : 'Onboard a new client'}
        </h2>
        <p className="text-sm text-text-muted mb-5">
          Drop a website URL and we&apos;ll build the full brand guideline
        </p>

        {!existingClientId && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-muted mb-1.5">Client name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Stealth Health Containers"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 px-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-medium text-text-muted mb-1.5">Website URL</label>
          <div className="relative">
            <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* File upload */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Upload files <span className="text-text-muted/60">(optional — logos, brand guides, docs)</span>
          </label>
          <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-text-muted hover:border-accent/40 hover:text-text-secondary transition-colors cursor-pointer">
            <Upload size={14} />
            Drop files or click to upload
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.md,.txt,.docx"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setUploadedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                }
              }}
            />
          </label>

          {uploadedFiles.length > 0 && (
            <div className="mt-2 space-y-1">
              {uploadedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
                  <FileText size={12} className="text-text-muted shrink-0" />
                  <span className="text-xs text-text-secondary truncate flex-1">{file.name}</span>
                  <button onClick={() => removeFile(i)} className="text-text-muted hover:text-red-400 cursor-pointer">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-end mt-6">
          <GlassButton onClick={handleStartAnalysis} disabled={!step1Valid || loading} loading={loading}>
            {loading ? 'Starting...' : 'Start analysis'}
          </GlassButton>
        </div>
      </div>

      {/* Step 2: Progress */}
      <div>
        <BrandDNAProgress
          clientId={clientId}
          onComplete={handleGenerationComplete}
        />
      </div>

      {/* Step 3: Review Brand DNA */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Brand DNA</h2>
            <p className="text-sm text-text-muted">{clientName || existingClientName}</p>
          </div>
          <button
            onClick={() => setStep(1)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={12} className="inline mr-1" />
            Back
          </button>
        </div>

        {brandDNA && (
          <BrandDNACards
            metadata={brandDNA.metadata as Record<string, unknown>}
            clientId={clientId}
          />
        )}

        <div className="flex justify-end mt-6">
          <GlassButton onClick={handleConfirm}>
            <Check size={14} />
            {existingClientId ? 'Activate Brand DNA' : 'Create client'}
          </GlassButton>
        </div>
      </div>

      {/* Step 4: only for new clients — handled by redirect in handleConfirm */}
      {!existingClientId && <div />}
    </WizardShell>
  );
}
