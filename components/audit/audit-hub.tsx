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
              Audit a prospect
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Paste a website URL to analyze their brand and social presence
            </p>
          </div>

          {/* Input form — mirrors research topic form style */}
          <div className="mx-auto mt-5 w-full overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)] transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)]">
            <input
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="Paste website URL (e.g. acme.com)"
              className="w-full min-h-[3.25rem] border-0 bg-transparent px-4 pt-4 pb-2 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:px-5 md:pt-5 md:text-base"
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

            {/* Social URL inputs — expandable */}
            {showSocials && (
              <div className="border-t border-nativz-border/60 px-4 py-3 space-y-2 md:px-5">
                <p className="text-xs text-text-muted mb-2">
                  Social profiles found on the website will be scraped automatically. Add any missing ones below:
                </p>
                {(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatform[]).map(platform => (
                  <div key={platform} className="flex items-center gap-2">
                    <span className="text-xs text-text-muted w-20 shrink-0">{PLATFORM_LABELS[platform]}</span>
                    <input
                      type="text"
                      value={socialUrls[platform] ?? ''}
                      onChange={(e) => setSocialUrl(platform, e.target.value)}
                      placeholder={`${platform}.com/@ or profile URL`}
                      className="flex-1 rounded-lg border border-nativz-border/60 bg-transparent px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-nativz-border/60 px-3 pb-3 pt-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
                {!showSocials && websiteUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => setShowSocials(true)}
                    className="inline-flex shrink-0 h-9 items-center gap-2 rounded-full border border-nativz-border bg-surface-hover/80 px-3 text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover"
                  >
                    <Plus size={15} className="text-text-muted" />
                    <span>Add social profiles</span>
                  </button>
                )}
                {websiteUrl.trim() && (
                  <span className="inline-flex shrink-0 h-9 items-center gap-2 rounded-full border border-accent/30 bg-accent-surface/20 px-3 text-xs font-medium text-accent-text">
                    <Globe size={15} />
                    <span className="truncate max-w-[10rem]">
                      {extractDomain(websiteUrl)}
                    </span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!showSocials && websiteUrl.trim()) setShowSocials(true);
                  else void handleStart();
                }}
                disabled={!isValid || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ArrowRight size={18} strokeWidth={2.25} />
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
