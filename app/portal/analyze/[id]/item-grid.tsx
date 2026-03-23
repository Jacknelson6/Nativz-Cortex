'use client';

import { useState } from 'react';
import { Video, Image as ImageIcon, Globe, X, Layers } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AnalyzeItem {
  id: string;
  type: 'video' | 'image' | 'website';
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  author_name: string | null;
  transcript: string | null;
  concept_summary: string | null;
  hook: string | null;
  winning_elements: string[];
  content_themes: string[];
  status: string;
}

const TYPE_ICON = {
  video: <Video size={14} className="text-blue-400" />,
  image: <ImageIcon size={14} className="text-emerald-400" />,
  website: <Globe size={14} className="text-accent2-text" />,
};

interface PortalAnalyzeItemGridProps {
  items: AnalyzeItem[];
}

export function PortalAnalyzeItemGrid({ items }: PortalAnalyzeItemGridProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedItem = items.find((i) => i.id === expandedId);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setExpandedId(item.id)}
            className="text-left"
          >
            <Card interactive padding="none" className="overflow-hidden">
              {/* Thumbnail */}
              <div className="h-36 relative overflow-hidden bg-surface-hover">
                {item.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail_url}
                    alt={item.title ?? ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Layers size={24} className="text-text-muted/20" />
                  </div>
                )}
                {item.platform && (
                  <span className="absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white capitalize">
                    {item.platform}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {TYPE_ICON[item.type]}
                  <p className="text-sm font-medium text-text-primary truncate">
                    {item.title || 'Untitled'}
                  </p>
                </div>
                {item.author_name && (
                  <p className="text-xs text-text-muted truncate">by {item.author_name}</p>
                )}
              </div>
            </Card>
          </button>
        ))}
      </div>

      {/* Expanded detail panel */}
      {expandedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-nativz-border bg-surface shadow-elevated mx-4">
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors z-10"
            >
              <X size={18} />
            </button>

            <div className="cortex-page-gutter space-y-5">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {TYPE_ICON[expandedItem.type]}
                  <Badge variant="default">{expandedItem.type}</Badge>
                  {expandedItem.platform && (
                    <Badge variant="purple">{expandedItem.platform}</Badge>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-text-primary mt-2">
                  {expandedItem.title || 'Untitled'}
                </h2>
                {expandedItem.author_name && (
                  <p className="text-sm text-text-muted">by {expandedItem.author_name}</p>
                )}
              </div>

              {/* Thumbnail */}
              {expandedItem.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={expandedItem.thumbnail_url}
                  alt={expandedItem.title ?? ''}
                  className="w-full rounded-lg object-cover max-h-64"
                />
              )}

              {/* AI insights */}
              {expandedItem.concept_summary && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Concept summary
                  </h3>
                  <p className="text-sm text-text-secondary">{expandedItem.concept_summary}</p>
                </div>
              )}

              {expandedItem.hook && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Hook
                  </h3>
                  <p className="text-sm text-text-secondary">{expandedItem.hook}</p>
                </div>
              )}

              {expandedItem.winning_elements.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Winning elements
                  </h3>
                  <ul className="space-y-1">
                    {expandedItem.winning_elements.map((el, i) => (
                      <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                        <span className="text-emerald-400 mt-1 shrink-0">&#8226;</span>
                        {el}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {expandedItem.content_themes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Content themes
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {expandedItem.content_themes.map((theme, i) => (
                      <Badge key={i} variant="info">{theme}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript */}
              {expandedItem.transcript && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Transcript
                  </h3>
                  <div className="rounded-lg bg-surface-hover p-4 max-h-48 overflow-y-auto">
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">
                      {expandedItem.transcript}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
