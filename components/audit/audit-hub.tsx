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
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditSummary {
  id: string;
  tiktok_url: string;
  website_url: string | null;
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

function extractUsername(url: string): string {
  try {
    const match = url.match(/@([\w.]+)/);
    return match ? `@${match[1]}` : url;
  } catch {
    return url;
  }
}

export function AuditHub({ audits, userFirstName }: AuditHubProps) {
  const router = useRouter();
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [showWebsite, setShowWebsite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const greetingName = userFirstName
    ? userFirstName.charAt(0).toUpperCase() + userFirstName.slice(1)
    : 'there';

  const isValid = tiktokUrl.trim().length > 0;

  async function handleStart() {
    if (!isValid) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiktok_url: tiktokUrl.trim(),
          website_url: websiteUrl.trim() || undefined,
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

  return (
    <div className="flex h-full">
      {/* History rail */}
      <div className="w-72 shrink-0 border-r border-nativz-border bg-surface/50 overflow-y-auto">
        <div className="p-4 border-b border-nativz-border">
          <h2 className="text-sm font-semibold text-text-primary">Audit history</h2>
          <p className="text-xs text-text-muted mt-0.5">{audits.length} audits</p>
        </div>
        <div className="divide-y divide-nativz-border">
          {audits.map((audit) => {
            const Icon = STATUS_ICON[audit.status as keyof typeof STATUS_ICON] ?? AlertCircle;
            const color = STATUS_COLOR[audit.status as keyof typeof STATUS_COLOR] ?? 'text-text-muted';
            const username = extractUsername(audit.tiktok_url);
            const score = (audit.scorecard as Record<string, unknown>)?.overallScore;

            return (
              <button
                key={audit.id}
                onClick={() => router.push(`/admin/audit/${audit.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover cursor-pointer"
              >
                <Icon size={16} className={`shrink-0 ${color} ${audit.status === 'processing' ? 'animate-spin' : ''}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{username}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(audit.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    {typeof score === 'number' && ` · Score: ${score}`}
                  </p>
                </div>
              </button>
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
              Paste a TikTok profile URL to analyze their social presence
            </p>
          </div>

          {/* Input form — mirrors research topic form style */}
          <div className="mx-auto mt-5 w-full overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)] transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)]">
            <input
              type="text"
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              placeholder="Paste TikTok profile URL (e.g. tiktok.com/@brand)"
              className="w-full min-h-[3.25rem] border-0 bg-transparent px-4 pt-4 pb-2 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:px-5 md:pt-5 md:text-base"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid) {
                  e.preventDefault();
                  if (!showWebsite) {
                    setShowWebsite(true);
                  } else {
                    void handleStart();
                  }
                }
              }}
            />

            {/* Website URL — appears after TikTok URL is entered */}
            {showWebsite && (
              <div className="border-t border-nativz-border/60">
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="Website URL for additional context (optional)"
                  className="w-full min-h-[2.75rem] border-0 bg-transparent px-4 py-2 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:px-5 md:text-base"
                  autoComplete="off"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleStart();
                    }
                  }}
                />
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-nativz-border/60 px-3 pb-3 pt-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
                {!showWebsite && tiktokUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => setShowWebsite(true)}
                    className="inline-flex shrink-0 h-9 items-center gap-2 rounded-full border border-nativz-border bg-surface-hover/80 px-3 text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover"
                  >
                    <Globe size={15} className="text-text-muted" />
                    <span>Add website</span>
                  </button>
                )}
                {showWebsite && websiteUrl.trim() && (
                  <span className="inline-flex shrink-0 h-9 items-center gap-2 rounded-full border border-accent/30 bg-accent-surface/20 px-3 text-xs font-medium text-accent-text">
                    <Globe size={15} />
                    <span className="truncate max-w-[10rem]">
                      {(() => {
                        try {
                          return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname;
                        } catch {
                          return websiteUrl;
                        }
                      })()}
                    </span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!showWebsite && tiktokUrl.trim()) {
                    setShowWebsite(true);
                  } else {
                    void handleStart();
                  }
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
