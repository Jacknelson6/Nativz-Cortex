'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Globe,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuditHistoryRail, type AuditSummary } from '@/components/audit/audit-history-rail';
import type { AuditPlatform } from '@/lib/audit/types';

interface AuditHubProps {
  audits: AuditSummary[];
  userFirstName: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function AuditHub({ audits: initialAudits, userFirstName }: AuditHubProps) {
  const router = useRouter();
  const [audits, setAudits] = useState(initialAudits);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [socialUrls, setSocialUrls] = useState<Partial<Record<AuditPlatform, string>>>({});
  const [showSocials, setShowSocials] = useState(false);
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
        body: JSON.stringify({
          website_url: websiteUrl.trim(),
          social_urls: Object.fromEntries(
            Object.entries(socialUrls).filter(([, v]) => v?.trim())
          ),
        }),
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

  function setSocialUrl(platform: AuditPlatform, value: string) {
    setSocialUrls(prev => ({ ...prev, [platform]: value }));
  }

  return (
    <div className="flex h-full">
      {/* History rail */}
      <div className="w-72 shrink-0 border-r border-nativz-border bg-surface/50">
        <AuditHistoryRail audits={audits} onAuditsChange={(a) => setAudits(a)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <div className="text-center">
            <p className="text-sm font-medium text-text-muted">Hello, {greetingName}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              Audit a brand
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Paste a website URL to analyze their brand and social presence
            </p>
          </div>

          {/* Input — single compact row with inline arrow button */}
          <div
            className="mx-auto mt-6 w-full max-w-lg flex items-center rounded-xl border border-nativz-border bg-surface pl-4 pr-2 transition-colors focus-within:border-accent/40"
          >
            <input
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none md:text-base"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid) {
                  e.preventDefault();
                  if (!showSocials) setShowSocials(true);
                  else void handleStart();
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!showSocials && websiteUrl.trim()) setShowSocials(true);
                else void handleStart();
              }}
              disabled={!isValid || loading}
              className="ml-2 shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Social URL inputs — expandable below the main input */}
          {showSocials && (
            <div className="mx-auto mt-3 w-full max-w-lg rounded-xl border border-nativz-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-text-muted">
                  Add social profiles (optional — we also detect them from the website)
                </p>
                <button onClick={() => setShowSocials(false)} className="text-text-muted hover:text-text-secondary cursor-pointer">
                  <X size={14} />
                </button>
              </div>
              {(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatform[]).map(platform => (
                <div key={platform} className="flex items-center gap-2">
                  <span className="text-xs text-text-muted w-20 shrink-0">{PLATFORM_LABELS[platform]}</span>
                  <input
                    type="text"
                    value={socialUrls[platform] ?? ''}
                    onChange={(e) => setSocialUrl(platform, e.target.value)}
                    placeholder={`${platform}.com/@username`}
                    className="flex-1 rounded-lg border border-nativz-border/60 bg-transparent px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!isValid || loading}
                className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {loading ? 'Starting...' : 'Start audit'}
              </button>
            </div>
          )}

          {/* Add social profiles link */}
          {!showSocials && websiteUrl.trim() && (
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setShowSocials(true)}
                className="text-xs text-text-muted hover:text-accent-text transition-colors cursor-pointer"
              >
                + Add social profiles manually
              </button>
            </div>
          )}

          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
