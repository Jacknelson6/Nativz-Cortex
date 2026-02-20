'use client';

import { Globe, MessageCircle, Video, ExternalLink } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import type { BraveSerpData } from '@/lib/brave/types';

interface SourcesPanelProps {
  serpData: BraveSerpData;
}

function SourceTypeSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: { url: string; title: string; detail?: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          {title} ({items.length})
        </h4>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="animate-stagger-in flex items-start gap-2 rounded-lg border border-nativz-border-light bg-background px-3 py-2.5 text-sm transition-colors hover:border-accent/40 hover:bg-accent-surface group"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text-primary truncate group-hover:text-accent-text transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-text-muted truncate mt-0.5">{item.url}</p>
              {item.detail && (
                <p className="text-xs text-text-muted mt-0.5">{item.detail}</p>
              )}
            </div>
            <ExternalLink size={12} className="shrink-0 mt-1 text-text-muted group-hover:text-accent-text transition-colors" />
          </a>
        ))}
      </div>
    </div>
  );
}

export function SourcesPanel({ serpData }: SourcesPanelProps) {
  const webItems = serpData.webResults.map(r => ({
    url: r.url,
    title: r.title,
    detail: r.description.slice(0, 120) + (r.description.length > 120 ? '...' : ''),
  }));

  const discussionItems = serpData.discussions.map(d => ({
    url: d.url,
    title: d.title,
    detail: [d.forum, d.answers ? `${d.answers} replies` : null].filter(Boolean).join(' · '),
  }));

  const videoItems = serpData.videos.map(v => ({
    url: v.url,
    title: v.title,
    detail: [v.platform, v.views ? `${v.views} views` : null, v.creator ? `by ${v.creator}` : null].filter(Boolean).join(' · '),
  }));

  const totalSources = webItems.length + discussionItems.length + videoItems.length;

  if (totalSources === 0) return null;

  return (
    <Card>
      <div className="mb-1">
        <CardTitle>Sources ({totalSources})</CardTitle>
        <p className="text-xs text-text-muted mt-1">
          All data in this report is derived from these real web sources
        </p>
      </div>

      <div className="mt-5 space-y-6">
        <SourceTypeSection
          title="Web"
          icon={<Globe size={14} className="text-blue-400" />}
          items={webItems}
        />
        <SourceTypeSection
          title="Discussions"
          icon={<MessageCircle size={14} className="text-emerald-400" />}
          items={discussionItems}
        />
        <SourceTypeSection
          title="Videos"
          icon={<Video size={14} className="text-purple-400" />}
          items={videoItems}
        />
      </div>
    </Card>
  );
}
