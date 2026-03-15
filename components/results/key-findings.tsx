'use client';

import {
  TrendingUp,
  AlertTriangle,
  Users,
  Target,
  MessageCircle,
  Zap,
  BarChart3,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

interface KeyFindingsProps {
  summary: string;
  topics: { name: string; resonance: string; sentiment: number }[];
}

interface Insight {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  text: string;
}

/** Keywords that signal the "type" of each insight sentence. */
const CLASSIFIERS: { keywords: string[]; icon: LucideIcon; color: string; label: string }[] = [
  { keywords: ['pain point', 'frustrat', 'complain', 'struggle', 'difficult', 'confus', 'sticker shock', 'expensive', 'cost'], icon: AlertTriangle, color: 'text-amber-400', label: 'Pain point' },
  { keywords: ['opportunit', 'suggest', 'potential', 'significant', 'chance', 'gap'], icon: Target, color: 'text-emerald-400', label: 'Opportunity' },
  { keywords: ['audience', 'user', 'homeowner', 'consumer', 'viewer', 'diy', 'people', 'customer'], icon: Users, color: 'text-blue-400', label: 'Audience' },
  { keywords: ['trend', 'growing', 'rising', 'momentum', 'surge', 'popular', 'viral'], icon: TrendingUp, color: 'text-purple-400', label: 'Trend' },
  { keywords: ['discussion', 'reddit', 'forum', 'comment', 'conversation', 'talk'], icon: MessageCircle, color: 'text-teal-400', label: 'Discussion' },
  { keywords: ['data', 'metric', 'stat', 'percent', 'number', '%', 'rate', 'engagement'], icon: BarChart3, color: 'text-indigo-400', label: 'Data point' },
];

function classifyInsight(sentence: string): { icon: LucideIcon; color: string; label: string } {
  const lower = sentence.toLowerCase();
  for (const c of CLASSIFIERS) {
    if (c.keywords.some((kw) => lower.includes(kw))) {
      return { icon: c.icon, color: c.color, label: c.label };
    }
  }
  return { icon: Lightbulb, color: 'text-accent-text', label: 'Insight' };
}

/**
 * Split summary into logical sentences, avoiding breaks mid-parenthetical.
 * Keeps 2+ sentences per chunk if they're short.
 */
function extractInsights(summary: string): Insight[] {
  // Split on sentence boundaries but preserve the delimiter
  const raw = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  if (raw.length === 0) return [];

  // Merge very short consecutive sentences
  const merged: string[] = [];
  for (const s of raw) {
    const last = merged[merged.length - 1];
    if (last && last.length < 60 && (last.length + s.length) < 180) {
      merged[merged.length - 1] = last + ' ' + s;
    } else {
      merged.push(s);
    }
  }

  return merged.slice(0, 5).map((text) => {
    const { icon, color, label } = classifyInsight(text);
    return { icon, iconColor: color, label, text };
  });
}

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.icon;
  const displayText = insight.text;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.10] hover:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ${insight.iconColor}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${insight.iconColor}`}>
            {insight.label}
          </span>
          <p className="text-xs leading-relaxed text-text-secondary mt-0.5">
            {displayText}
          </p>
        </div>
      </div>
    </div>
  );
}

export function KeyFindings({ summary }: KeyFindingsProps) {
  const insights = extractInsights(summary);
  if (insights.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {insights.map((insight, i) => (
        <InsightCard key={i} insight={insight} />
      ))}
    </div>
  );
}
