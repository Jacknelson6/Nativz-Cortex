'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, CheckCircle2, Users, Target, Lightbulb, TrendingUp, Video, Trophy, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GlowButton } from '@/components/ui/glow-button';
import type { ClientStrategy } from '@/lib/types/strategy';
import { PdfDownloadButton } from './pdf-download-button';
import { InviteButton } from '@/components/clients/invite-button';

interface OnboardReviewProps {
  clientId: string;
  clientName: string;
  strategyId?: string;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  audience: <Users size={14} />,
  pillars: <Target size={14} />,
  trends: <TrendingUp size={14} />,
  videos: <Video size={14} />,
  competitive: <Trophy size={14} />,
  next_steps: <ListChecks size={14} />,
};

export function OnboardReview({ clientId, clientName }: OnboardReviewProps) {
  const [strategy, setStrategy] = useState<ClientStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('summary');
  const [showCelebration, setShowCelebration] = useState(true);
  const celebrationRef = useRef<HTMLDivElement>(null);

  const fetchStrategy = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/strategy`);
      if (res.ok) {
        const data = await res.json();
        setStrategy(data);
      }
    } catch {
      // Silently fail — user can still navigate
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchStrategy();
    // Auto-dismiss celebration after 3 seconds
    const timer = setTimeout(() => setShowCelebration(false), 3000);
    return () => clearTimeout(timer);
  }, [fetchStrategy]);

  if (loading) {
    return (
      <div className="animate-fade-slide-in space-y-4 max-w-2xl mx-auto">
        {/* Skeleton header */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="h-6 w-40 rounded-full bg-surface-hover animate-pulse" />
          <div className="h-5 w-64 rounded bg-surface-hover animate-pulse" />
          <div className="h-4 w-48 rounded bg-surface-hover animate-pulse" />
        </div>
        {/* Skeleton buttons */}
        <div className="flex justify-center gap-3">
          <div className="h-9 w-32 rounded-xl bg-surface-hover animate-pulse" />
          <div className="h-9 w-36 rounded-xl bg-surface-hover animate-pulse" />
        </div>
        {/* Skeleton tabs */}
        <div className="flex gap-2 overflow-hidden">
          {[80, 70, 60, 70, 60, 60, 80, 70].map((w, i) => (
            <div key={i} className="h-7 rounded-lg bg-surface-hover animate-pulse" style={{ width: w, animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
        {/* Skeleton card */}
        <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-3">
          <div className="h-4 w-32 rounded bg-surface-hover animate-pulse" />
          <div className="h-3 w-full rounded bg-surface-hover animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-surface-hover animate-pulse" />
          <div className="h-3 w-4/6 rounded bg-surface-hover animate-pulse" />
        </div>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Strategy not found. The generation may still be processing.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => { setLoading(true); fetchStrategy(); }}>
          Refresh
        </Button>
      </div>
    );
  }

  const sections = [
    { key: 'summary', label: 'Summary', icon: <Lightbulb size={14} /> },
    { key: 'audience', label: 'Audience', icon: SECTION_ICONS.audience },
    { key: 'pillars', label: 'Pillars', icon: SECTION_ICONS.pillars },
    { key: 'trends', label: 'Trends', icon: SECTION_ICONS.trends },
    { key: 'videos', label: 'Videos', icon: SECTION_ICONS.videos },
    { key: 'competitive', label: 'Competitive', icon: SECTION_ICONS.competitive },
    { key: 'next_steps', label: 'Next steps', icon: SECTION_ICONS.next_steps },
  ];

  return (
    <div className="animate-fade-slide-in relative">
      {/* Celebration particles — subtle burst on completion */}
      {showCelebration && (
        <div ref={celebrationRef} className="absolute inset-0 pointer-events-none overflow-hidden -top-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-0 w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: i % 3 === 0 ? '#046BD2' : i % 3 === 1 ? '#8B5CF6' : '#10B981',
                animation: `confetti-burst 1.5s ease-out ${i * 0.08}s forwards`,
                transform: `rotate(${i * 30}deg) translateY(0)`,
                opacity: 0,
              }}
            />
          ))}
          <style>{`
            @keyframes confetti-burst {
              0% { opacity: 1; transform: rotate(var(--angle, 0deg)) translateY(0) scale(1); }
              100% { opacity: 0; transform: rotate(var(--angle, 0deg)) translateY(-80px) translateX(${
                'var(--x, 0px)'
              }) scale(0.3); }
            }
            ${Array.from({ length: 12 }).map((_, i) => `
              .absolute:nth-child(${i + 1}) {
                --angle: ${i * 30}deg;
                --x: ${Math.cos((i * 30 * Math.PI) / 180) * 60}px;
                animation-name: confetti-burst-${i};
              }
              @keyframes confetti-burst-${i} {
                0% { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
                100% { opacity: 0; transform: translateX(${Math.cos((i * 30 * Math.PI) / 180) * 80}px) translateY(${-40 - Math.random() * 60}px) scale(0.2); }
              }
            `).join('')}
          `}</style>
        </div>
      )}

      {/* Success header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-4">
          <CheckCircle2 size={12} />
          Onboarding complete
        </div>
        <h2 className="text-xl font-semibold text-text-primary">
          {clientName}&apos;s content strategy is ready
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Review the strategy below, then export as PDF or head to the client page
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <PdfDownloadButton strategy={strategy} clientName={clientName} />
        <Link href={`/admin/clients/${clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
          <GlowButton>
            <ExternalLink size={14} />
            View client page
          </GlowButton>
        </Link>
      </div>

      {/* Portal invite */}
      <Card className="max-w-md mx-auto mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Invite to portal</h3>
        <p className="text-xs text-text-muted mb-3">Send a portal invite so {clientName} can self-serve.</p>
        <InviteButton clientId={clientId} clientName={clientName} />
      </Card>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200
              ${activeSection === s.key
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-surface-hover text-text-muted hover:text-text-secondary border border-transparent'
              }
            `}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4 animate-fade-slide-in" key={activeSection}>
        {activeSection === 'summary' && (
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-3">Executive summary</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{strategy.executive_summary ?? 'No summary available.'}</p>
            {strategy.tokens_used && (
              <p className="text-[10px] text-text-muted mt-4">
                AI: {strategy.tokens_used.toLocaleString()} tokens • ${(strategy.estimated_cost ?? 0).toFixed(4)}
              </p>
            )}
          </Card>
        )}

        {activeSection === 'audience' && strategy.audience_analysis && (
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-3">Audience analysis</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-text-primary">Demographics</p>
                <p className="text-text-secondary">{strategy.audience_analysis.demographics}</p>
              </div>
              <div>
                <p className="font-medium text-text-primary">Psychographics</p>
                <p className="text-text-secondary">{strategy.audience_analysis.psychographics}</p>
              </div>
              <div>
                <p className="font-medium text-text-primary">Online behavior</p>
                <p className="text-text-secondary">{strategy.audience_analysis.online_behavior}</p>
              </div>
              {(strategy.audience_analysis.pain_points ?? []).length > 0 && (
                <div>
                  <p className="font-medium text-text-primary mb-1">Pain points</p>
                  <ul className="space-y-1">
                    {(strategy.audience_analysis.pain_points ?? []).map((p, i) => (
                      <li key={i} className="text-text-secondary flex items-start gap-2">
                        <span className="text-red-400 mt-1">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(strategy.audience_analysis.aspirations ?? []).length > 0 && (
                <div>
                  <p className="font-medium text-text-primary mb-1">Aspirations</p>
                  <ul className="space-y-1">
                    {(strategy.audience_analysis.aspirations ?? []).map((a, i) => (
                      <li key={i} className="text-text-secondary flex items-start gap-2">
                        <span className="text-emerald-400 mt-1">•</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}

        {activeSection === 'pillars' && (strategy.content_pillars ?? []).length > 0 && (
          <div className="grid gap-3">
            {(strategy.content_pillars ?? []).map((pillar, i) => (
              <Card key={i}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-text-primary">{pillar.pillar}</h4>
                    <p className="text-xs text-text-secondary mt-1">{pillar.description}</p>
                    <p className="text-[10px] text-text-muted mt-2">
                      {pillar.frequency} • {(pillar.formats ?? []).join(', ')}
                    </p>
                    {(pillar.hooks ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(pillar.hooks ?? []).map((h, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded-md bg-surface-hover text-text-muted">
                            &ldquo;{h}&rdquo;
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeSection === 'trends' && (strategy.trending_opportunities ?? []).length > 0 && (
          <div className="space-y-3">
            {(strategy.trending_opportunities ?? []).map((t, i) => (
              <Card key={i} padding="sm">
                <div className="flex items-start gap-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                    t.urgency === 'act_now' ? 'bg-red-500/15 text-red-400'
                    : t.urgency === 'this_week' ? 'bg-amber-500/15 text-amber-400'
                    : t.urgency === 'this_month' ? 'bg-accent/15 text-accent'
                    : 'bg-surface-hover text-text-muted'
                  }`}>
                    {t.urgency.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">{t.trend}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{t.content_angle}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeSection === 'videos' && (strategy.video_ideas ?? []).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(strategy.video_ideas ?? []).map((v, i) => (
              <Card key={i} padding="sm">
                <div className="flex items-center gap-2 mb-2">
                  <Video size={12} className="text-accent" />
                  <h4 className="text-xs font-semibold text-text-primary truncate">{v.title}</h4>
                </div>
                <p className="text-[11px] text-accent mb-1">&ldquo;{v.hook}&rdquo;</p>
                <p className="text-[10px] text-text-muted">
                  {v.format} • {v.platform} • {v.estimated_virality}
                </p>
                <p className="text-[10px] text-text-secondary mt-1">{v.why_it_works}</p>
              </Card>
            ))}
          </div>
        )}

        {activeSection === 'competitive' && (strategy.competitive_landscape ?? []).length > 0 && (
          <div className="space-y-3">
            {(strategy.competitive_landscape ?? []).map((c, i) => (
              <Card key={i}>
                <h4 className="text-sm font-semibold text-text-primary mb-2">{c.competitor}</h4>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-text-muted mb-0.5">Strengths</p>
                    <p className="text-text-secondary">{c.strengths}</p>
                  </div>
                  <div>
                    <p className="text-text-muted mb-0.5">Weaknesses</p>
                    <p className="text-text-secondary">{c.weaknesses}</p>
                  </div>
                  <div>
                    <p className="text-text-muted mb-0.5">Opportunity</p>
                    <p className="text-emerald-400">{c.gap_opportunity}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeSection === 'next_steps' && (strategy.next_steps ?? []).length > 0 && (
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-3">First 30 days</h3>
            <div className="space-y-2">
              {(strategy.next_steps ?? []).map((s, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-nativz-border last:border-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                    s.priority === 'high' ? 'bg-red-500/15 text-red-400'
                    : s.priority === 'medium' ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-surface-hover text-text-muted'
                  }`}>
                    {s.priority}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-text-primary">{s.action}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{s.timeline} • {s.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
