'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuditHistoryRail, type AuditSummary } from '@/components/audit/audit-history-rail';

interface AuditHubProps {
  audits: AuditSummary[];
  userFirstName: string | null;
}

export function AuditHub({ audits: initialAudits, userFirstName }: AuditHubProps) {
  const router = useRouter();
  const [audits, setAudits] = useState(initialAudits);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const greetingName = userFirstName
    ? userFirstName.charAt(0).toUpperCase() + userFirstName.slice(1)
    : 'there';

  const isValid = websiteUrl.trim().length > 0;

  async function handleStart() {
    if (!isValid) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: websiteUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start audit');
        return;
      }

      toast.success('Audit started');
      router.push(`/admin/audit/${data.id}`);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* History rail — only this scrolls */}
      <div className="w-72 shrink-0 border-r border-nativz-border bg-surface/50 overflow-y-auto">
        <AuditHistoryRail audits={audits} onAuditsChange={(a) => setAudits(a)} />
      </div>

      {/* Main area — fixed, centered, no scroll */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        <div className="w-full max-w-xl">
          <div className="text-center">
            <p className="text-sm font-medium text-text-muted">Hello, {greetingName}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              Analyze your socials
            </p>
          </div>

          {/* Input card — single row with arrow on the input line */}
          <div className="mx-auto mt-4 w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)] transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)] md:mt-5">
            <div className="flex items-center gap-2 px-4 md:px-5">
              <label htmlFor="audit-url-input" className="sr-only">Website URL</label>
              <input
                id="audit-url-input"
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="Paste a website URL"
                className="min-w-0 flex-1 min-h-[3.25rem] border-0 bg-transparent py-3 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:text-base"
                autoComplete="off"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValid) {
                    e.preventDefault();
                    void handleStart();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!isValid || loading}
                aria-label="Start audit"
                className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-accent text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : (
                  <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
