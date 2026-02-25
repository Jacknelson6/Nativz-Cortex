'use client';

import { CheckCircle2, Target, Zap, ArrowRight } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import type { TopicSearchAIResponse, TrendingTopic, VideoIdea } from '@/lib/types/search';

interface ActionItemsProps {
  aiResponse: TopicSearchAIResponse;
  topics: TrendingTopic[];
  isBrandSearch: boolean;
}

export function ActionItems({ aiResponse, topics, isBrandSearch }: ActionItemsProps) {
  // Generate recommendations from AI response data
  const recommendations: { icon: React.ReactNode; text: string; priority: 'high' | 'medium' | 'low' }[] = [];

  // High-resonance topics
  const viralTopics = topics.filter((t) => t.resonance === 'viral' || t.resonance === 'high');
  if (viralTopics.length > 0) {
    recommendations.push({
      icon: <Zap size={14} className="text-amber-400" />,
      text: `Create content around "${viralTopics[0].name}" — it's trending with ${viralTopics[0].resonance} resonance`,
      priority: 'high',
    });
  }

  // Best video ideas
  const allVideoIdeas = topics.flatMap((t) => t.video_ideas || []);
  const viralIdeas = allVideoIdeas.filter((v: VideoIdea) => v.virality === 'viral_potential' || v.virality === 'high');
  if (viralIdeas.length > 0) {
    recommendations.push({
      icon: <Target size={14} className="text-purple-400" />,
      text: `Produce "${viralIdeas[0].title}" (${viralIdeas[0].format}) — high virality potential`,
      priority: 'high',
    });
  }

  // Sentiment-based recommendation
  const overallSentiment = aiResponse.overall_sentiment ?? 0;
  if (overallSentiment < -0.2) {
    recommendations.push({
      icon: <CheckCircle2 size={14} className="text-red-400" />,
      text: 'Negative sentiment detected — consider addressing concerns or pivoting messaging',
      priority: 'high',
    });
  } else if (overallSentiment > 0.3) {
    recommendations.push({
      icon: <CheckCircle2 size={14} className="text-emerald-400" />,
      text: 'Strong positive sentiment — amplify what\'s working and double down on successful themes',
      priority: 'medium',
    });
  }

  // Content pillars recommendation
  if (aiResponse.content_pillars && aiResponse.content_pillars.length > 0) {
    recommendations.push({
      icon: <Target size={14} className="text-blue-400" />,
      text: `Focus content strategy on ${aiResponse.content_pillars.length} identified pillars: ${aiResponse.content_pillars.slice(0, 2).map((p) => p.pillar).join(', ')}`,
      priority: 'medium',
    });
  }

  // Niche insights
  if (aiResponse.niche_performance_insights) {
    const insights = aiResponse.niche_performance_insights;
    if (insights.competitor_gaps) {
      recommendations.push({
        icon: <Zap size={14} className="text-cyan-400" />,
        text: `Competitor gap opportunity: ${insights.competitor_gaps}`,
        priority: 'medium',
      });
    }
  }

  // General recommendation
  if (topics.length > 3) {
    recommendations.push({
      icon: <CheckCircle2 size={14} className="text-text-muted" />,
      text: `${topics.length} trending angles found — batch-plan content for the top 3-5 topics this week`,
      priority: 'low',
    });
  }

  if (recommendations.length === 0) return null;

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
          <CheckCircle2 size={16} className="text-emerald-400" />
        </div>
        <CardTitle className="!mb-0">Recommended actions</CardTitle>
      </div>

      <div className="space-y-2.5">
        {recommendations.slice(0, 6).map((rec, i) => (
          <div
            key={i}
            className="animate-stagger-in flex items-start gap-3 rounded-lg border border-nativz-border-light bg-background px-4 py-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="mt-0.5 shrink-0">{rec.icon}</div>
            <p className="text-sm text-text-secondary flex-1">{rec.text}</p>
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                rec.priority === 'high'
                  ? 'text-amber-400 bg-amber-500/10'
                  : rec.priority === 'medium'
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-text-muted bg-white/5'
              }`}
            >
              {rec.priority}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
