'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Loader2, AlertCircle, Database, BookOpen, LayoutGrid, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OnboardFormData, ProvisionResult } from '@/lib/types/strategy';

interface OnboardProvisionProps {
  formData: OnboardFormData;
  onNext: (result: ProvisionResult & { clientId: string }) => void;
  onBack: () => void;
}

interface SystemStatus {
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
}

export function OnboardProvision({ formData, onNext, onBack }: OnboardProvisionProps) {
  const [systems, setSystems] = useState<SystemStatus[]>([
    { label: 'Creating in Cortex database', icon: <Database size={14} />, status: 'pending' },
    { label: 'Syncing to Obsidian vault', icon: <BookOpen size={14} />, status: 'pending' },
    { label: 'Adding to Monday.com board', icon: <LayoutGrid size={14} />, status: 'pending' },
  ]);
  const [error, setError] = useState('');
  const hasStarted = useRef(false);

  const provision = useCallback(async () => {
    setError('');
    // Animate: set all to running with staggered timing
    setSystems((prev) => prev.map((s) => ({ ...s, status: 'running' })));

    try {
      const res = await fetch('/api/clients/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Provisioning failed');
        setSystems((prev) => prev.map((s) => ({ ...s, status: 'error' })));
        return;
      }

      // Update each system's status based on response
      setSystems([
        {
          label: 'Creating in Cortex database',
          icon: <Database size={14} />,
          status: data.cortex?.success ? 'success' : 'error',
          error: data.cortex?.error,
        },
        {
          label: 'Syncing to Obsidian vault',
          icon: <BookOpen size={14} />,
          status: data.vault?.success ? 'success' : 'error',
          error: data.vault?.error,
        },
        {
          label: 'Adding to Monday.com board',
          icon: <LayoutGrid size={14} />,
          status: data.monday?.success ? 'success' : 'error',
          error: data.monday?.error,
        },
      ]);

      if (data.cortex?.success) {
        // Short delay to let the user see the success states
        setTimeout(() => {
          onNext({
            cortex: data.cortex,
            vault: data.vault,
            monday: data.monday,
            clientId: data.cortex.clientId,
          });
        }, 1200);
      } else {
        setError('Core database creation failed. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setSystems((prev) => prev.map((s) => ({ ...s, status: 'error' })));
    }
  }, [formData, onNext]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      provision();
    }
  }, [provision]);

  return (
    <div className="animate-fade-slide-in">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-text-primary">
          Setting up {formData.name}
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Provisioning across all systems...
        </p>
      </div>

      <div className="max-w-sm mx-auto space-y-3">
        {systems.map((system, i) => (
          <div
            key={system.label}
            className="flex items-center gap-3 rounded-xl border border-nativz-border bg-surface p-4 transition-all duration-500"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            {/* Status indicator */}
            <div className={`
              flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-500
              ${system.status === 'success'
                ? 'bg-emerald-500/15 text-emerald-400'
                : system.status === 'error'
                  ? 'bg-red-500/15 text-red-400'
                  : system.status === 'running'
                    ? 'bg-accent/15 text-accent'
                    : 'bg-surface-hover text-text-muted'
              }
            `}>
              {system.status === 'running' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : system.status === 'success' ? (
                <Check size={14} className="animate-fade-slide-in" />
              ) : system.status === 'error' ? (
                <AlertCircle size={14} />
              ) : (
                system.icon
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                system.status === 'success' ? 'text-text-secondary' : 'text-text-primary'
              }`}>
                {system.label}
              </p>
              {system.error && (
                <p className="text-xs text-red-400 mt-0.5 truncate">{system.error}</p>
              )}
            </div>

            {/* Subtle completion pulse */}
            {system.status === 'success' && (
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="max-w-sm mx-auto mt-6">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400">{error}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={onBack}>
                    Go back
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    hasStarted.current = false;
                    provision();
                  }}>
                    <RotateCcw size={12} />
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fun detail: pulsing dot grid behind the cards */}
      {!error && systems.some((s) => s.status === 'running') && (
        <div className="flex justify-center mt-6 gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full bg-accent/30"
              style={{
                animation: `pulse 2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
