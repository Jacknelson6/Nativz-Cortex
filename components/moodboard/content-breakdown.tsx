'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ContentClassification } from '@/lib/mediapipe/types';

interface ContentBreakdownProps {
  classification: ContentClassification;
  videoDurationMs: number;
}

const TYPE_COLORS: Record<string, string> = {
  talkingHead: '#60A5FA', // blue-400
  broll: '#34D399', // emerald-400
  productShot: '#A78BFA', // violet-400
  textScreen: '#FBBF24', // amber-400
  transition: '#6B7280', // gray-500
};

const TYPE_LABELS: Record<string, string> = {
  talkingHead: 'Talking head',
  broll: 'B-roll',
  productShot: 'Product shot',
  textScreen: 'Text screen',
  transition: 'Transition',
};

function formatMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const SEGMENT_COLORS: Record<string, string> = {
  talking_head: '#60A5FA',
  broll: '#34D399',
  product_shot: '#A78BFA',
  text_screen: '#FBBF24',
  transition: '#6B7280',
};

export function ContentBreakdown({ classification, videoDurationMs }: ContentBreakdownProps) {
  const chartData = Object.entries(classification.ratios)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: TYPE_LABELS[key] ?? key,
      value: Math.round(value * 100),
      color: TYPE_COLORS[key] ?? '#6B7280',
    }));

  return (
    <div className="space-y-4">
      {/* Pie chart */}
      <div
        className="h-[180px]"
        aria-label={`Content breakdown: ${chartData.map((d) => `${d.value}% ${d.name}`).join(', ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '12px',
              }}
              formatter={(value) => `${value}%`}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', color: 'var(--color-text-muted)' }}
              formatter={(value: string) => <span className="text-text-muted">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Segment timeline */}
      <div>
        <p className="text-[10px] text-text-muted mb-1 uppercase tracking-wider">Timeline</p>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
          {classification.segments.map((seg, i) => (
            <div
              key={i}
              style={{
                width: `${((seg.endMs - seg.startMs) / videoDurationMs) * 100}%`,
                minWidth: '2px',
                backgroundColor: SEGMENT_COLORS[seg.type] ?? '#6B7280',
              }}
              className="first:rounded-l-full last:rounded-r-full"
              title={`${seg.type.replace('_', ' ')}: ${formatMs(seg.endMs - seg.startMs)}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="text-xs">
          <span className="text-text-muted">Format: </span>
          <span className="text-text-primary font-medium">{classification.dominantFormat.replace('_', ' ')}</span>
        </div>
        <div className="text-xs">
          <span className="text-text-muted">Scenes: </span>
          <span className="text-text-primary font-medium">{classification.uniqueSceneCount}</span>
        </div>
        <div className="text-xs">
          <span className="text-text-muted">Variety: </span>
          <span className="text-text-primary font-medium">{classification.visualVarietyScore}/10</span>
        </div>
        <div className="text-xs">
          <span className="text-text-muted">B-roll: </span>
          <span className="text-text-primary font-medium">{classification.brollQualityScore}/10</span>
        </div>
      </div>
    </div>
  );
}
