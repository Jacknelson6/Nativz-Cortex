'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  Eye,
  TrendingUp,
  BarChart3,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ProspectData, CompetitorProfile, AuditScorecard, ScorecardItem, ScoreStatus } from '@/lib/audit/types';

interface AuditRecord {
  id: string;
  tiktok_url: string;
  website_url: string | null;
  status: string;
  prospect_data: ProspectData | null;
  competitors_data: CompetitorProfile[] | null;
  scorecard: AuditScorecard | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<ScoreStatus, { dot: string; bg: string; text: string }> = {
  good: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  warning: { dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  poor: { dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const STATUS_ICONS: Record<ScoreStatus, typeof CheckCircle> = {
  good: CheckCircle,
  warning: AlertTriangle,
  poor: XCircle,
};

export function AuditReport({ audit: initialAudit }: { audit: AuditRecord }) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [processing, setProcessing] = useState(false);

  // Auto-start processing for pending audits
  useEffect(() => {
    if (audit.status === 'pending') {
      void startProcessing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for completion when processing
  useEffect(() => {
    if (audit.status !== 'processing') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit/${audit.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.audit.status !== 'processing') {
            setAudit(data.audit);
            setProcessing(false);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [audit.id, audit.status]);

  async function startProcessing() {
    setProcessing(true);
    setAudit(prev => ({ ...prev, status: 'processing' }));
    try {
      const res = await fetch(`/api/audit/${audit.id}/process`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Processing failed');
      }
      // Poll will pick up the result
    } catch {
      toast.error('Failed to start processing');
      setProcessing(false);
    }
  }

  const prospect = audit.prospect_data;
  const competitors = audit.competitors_data ?? [];
  const scorecard = audit.scorecard;

  // Processing state
  if (audit.status === 'processing' || audit.status === 'pending') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="relative mx-auto mb-6 h-16 w-16">
            <Loader2 size={64} className="animate-spin text-accent-text" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Analyzing prospect</h2>
          <p className="mt-2 text-sm text-text-muted">
            Scraping TikTok profile, identifying competitors, and generating your audit report. This usually takes 1-2 minutes.
          </p>
          <div className="mt-6 space-y-2">
            {['Scraping TikTok profile', 'Crawling website', 'Discovering competitors', 'Analyzing engagement', 'Generating scorecard'].map((step, i) => (
              <div key={step} className="flex items-center gap-2 text-sm text-text-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-accent-text/40 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (audit.status === 'failed') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary">Audit failed</h2>
          <p className="mt-2 text-sm text-text-muted">{audit.error_message ?? 'An unknown error occurred.'}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/audit')}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button size="sm" onClick={startProcessing}>
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Completed — show report
  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}>
          <ArrowLeft size={14} /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-text-primary">
            Prospect audit: {prospect?.profile?.displayName ?? 'Unknown'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            @{prospect?.profile?.username} · {new Date(audit.created_at).toLocaleDateString()}
          </p>
        </div>
        {scorecard && (
          <div className="flex items-center gap-2">
            <div className={`text-3xl font-bold ${
              scorecard.overallScore >= 70 ? 'text-emerald-400' :
              scorecard.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {scorecard.overallScore}
            </div>
            <span className="text-xs text-text-muted">/100</span>
          </div>
        )}
      </div>

      {/* Prospect overview card */}
      {prospect && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-start gap-4">
            {prospect.profile.avatarUrl && (
              <img
                src={prospect.profile.avatarUrl}
                alt={prospect.profile.displayName}
                className="h-16 w-16 rounded-full object-cover"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">{prospect.profile.displayName}</h2>
                {prospect.profile.verified && (
                  <CheckCircle size={16} className="text-accent-text" />
                )}
              </div>
              <a
                href={prospect.profile.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-text hover:underline flex items-center gap-1"
              >
                @{prospect.profile.username} <ExternalLink size={12} />
              </a>
              {prospect.profile.bio && (
                <p className="mt-2 text-sm text-text-secondary">{prospect.profile.bio}</p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Followers" value={formatNumber(prospect.profile.followers)} />
            <StatCard icon={Eye} label="Avg views" value={formatNumber(prospect.avgViews)} />
            <StatCard icon={TrendingUp} label="Engagement" value={`${(prospect.engagementRate * 100).toFixed(2)}%`} />
            <StatCard icon={BarChart3} label="Frequency" value={prospect.postingFrequency} />
          </div>
        </div>
      )}

      {/* Summary */}
      {scorecard?.summary && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Executive summary</h3>
          <p className="text-sm text-text-secondary leading-relaxed">{scorecard.summary}</p>
        </div>
      )}

      {/* Scorecard */}
      {scorecard && scorecard.items.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-nativz-border">
            <h3 className="text-sm font-semibold text-text-primary">Audit scorecard</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Green = doing well · Yellow = could improve · Red = needs attention
            </p>
          </div>
          <div className="divide-y divide-nativz-border">
            {scorecard.items.map((item, i) => (
              <ScorecardRow key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Competitors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {competitors.map((comp) => (
              <div key={comp.username} className="rounded-lg border border-nativz-border bg-background p-4">
                <div className="flex items-center gap-3 mb-3">
                  {comp.avatarUrl && (
                    <img src={comp.avatarUrl} alt={comp.displayName} className="h-10 w-10 rounded-full object-cover" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-text-primary">{comp.displayName}</p>
                    <a
                      href={comp.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent-text hover:underline flex items-center gap-1"
                    >
                      @{comp.username} <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-text-muted">Followers</span>
                    <p className="font-medium text-text-primary">{formatNumber(comp.followers)}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Engagement</span>
                    <p className="font-medium text-text-primary">{(comp.engagementRate * 100).toFixed(2)}%</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Avg views</span>
                    <p className="font-medium text-text-primary">{formatNumber(comp.avgViews)}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Frequency</span>
                    <p className="font-medium text-text-primary">{comp.postingFrequency}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScorecardRow({ item }: { item: ScorecardItem }) {
  const prospectStyle = STATUS_COLORS[item.prospectStatus];
  const ProspectIcon = STATUS_ICONS[item.prospectStatus];

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-6 w-6 rounded-full ${prospectStyle.bg} flex items-center justify-center shrink-0`}>
          <ProspectIcon size={14} className={prospectStyle.text} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-text-primary">{item.label}</h4>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{item.prospectValue}</p>
          <p className="text-xs text-text-muted mt-1">{item.description}</p>

          {/* Competitor comparison */}
          {item.competitors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.competitors.map((comp) => {
                const compStyle = STATUS_COLORS[comp.status];
                return (
                  <span
                    key={comp.username}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${compStyle.bg} ${compStyle.text}`}
                    title={comp.value}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${compStyle.dot}`} />
                    @{comp.username}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-nativz-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-text-muted mb-1">
        <Icon size={12} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
