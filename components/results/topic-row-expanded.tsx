'use client';

import { MessageSquare, FileText } from 'lucide-react';
import { VideoIdeaCard } from './video-idea-card';
import type { TrendingTopic } from '@/lib/types/search';

interface TopicRowExpandedProps {
  topic: TrendingTopic;
}

export function TopicRowExpanded({ topic }: TopicRowExpandedProps) {
  return (
    <div className="animate-fade-in border-b border-gray-100 bg-gray-50/50 px-6 py-5">
      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-indigo-500" />
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">Posts overview</h4>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{topic.posts_overview}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={14} className="text-emerald-500" />
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">Comments overview</h4>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{topic.comments_overview}</p>
        </div>
      </div>

      {/* Video ideas */}
      {topic.video_ideas.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Video ideas ({topic.video_ideas.length})
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {topic.video_ideas.map((idea, i) => (
              <VideoIdeaCard key={i} idea={idea} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
