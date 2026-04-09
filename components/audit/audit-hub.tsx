'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Globe,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AuditPlatform } from '@/lib/audit/types';

interface AuditSummary {
  id: string;
  website_url: string | null;
  tiktok_url: string;
  status: string;
  created_at: string;
  prospect_data: Record<string, unknown> | null;
  scorecard: Record<string, unknown> | null;
}

interface AuditHubProps {
  audits: AuditSummary[];
  userFirstName: string | null;
}

const STATUS_ICON = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const STATUS_COLOR = {
  pending: 'text-text-muted',
  processing: 'text-accent-text',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

function extractDomain(url: string | null): string {
  if (!url) return 'Unknown';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(e: React.MouseEvent, auditId: string) {
    e.stopPropagation();
    setDeletingId(auditId);
    try {
      await fetch(`/api/audit?id=${auditId}`, { method: 'DELETE' });
      setAudits(prev => prev.filter(a => a.id !== auditId));
      toast.success('Audit deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function setSocialUrl(platform: AuditPlatform, value: string) {
    setSocialUrls(prev => ({ ...prev, [platform]: value }));
  }

  return (
    <div className="flex h-full">
      {/* History rail — matches research history rail style */}
      <div className="w-72 shrink-0 border-r border-nativz-border bg-surface/50 overflow-y-auto">
        <div className="p-4 border-b border-nativz-border">
          <h2 className="text-sm font-semibold text-text-primary">Audit history</h2>
          <p className="text-xs text-text-muted mt-0.5">{audits.length} audit{audits.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="divide-y divide-nativz-border">
          {audits.map((audit) => {
            const Icon = STATUS_ICON[audit.status as keyof typeof STATUS_ICON] ?? AlertCircle;
            const color = STATUS_COLOR[audit.status as keyof typeof STATUS_COLOR] ?? 'text-text-muted';
            const domain = extractDomain(audit.website_url);
            const score = (audit.scorecard as Record<string, unknown>)?.overallScore;

            return (
              <div key={audit.id} className="group relative">
                <button
                  onClick={() => router.push(`/admin/audit/${audit.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover cursor-pointer"
                >
                  <Icon size={16} className={`shrink-0 ${color} ${audit.status === 'processing' ? 'animate-spin' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{domain}</p>
                    <p className="text-xs text-text-muted">
                      {new Date(audit.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      {typeof score === 'number' && ` · Score: ${score}`}
                    </p>
                  </div>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, audit.id)}
                  disabled={deletingId === audit.id}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 rounded-md p-1.5 text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                  title="Delete audit"
                >
                  {deletingId === audit.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            );
          })}
          {audits.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No audits yet
            </div>
          )}
        </div>
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

          {/* Input — single line with inline submit button */}
          <div className="mx-auto mt-6 w-full max-w-lg flex items-center gap-2 rounded-xl border border-nativz-border bg-surface px-3 transition-colors focus-within:border-accent/40">
            <input
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 bg-transparent py-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none md:text-base"
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
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
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
