'use client';

import { Plus, Minus, Maximize2 } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  brand_profile: '#f59e0b',
  web_page: '#38bdf8',
  note: '#a78bfa',
  document: '#a78bfa',
  idea: '#f472b6',
  idea_submission: '#f472b6',
  brand_asset: '#f59e0b',
  contact: '#fb923c',
  search: '#2dd4bf',
  strategy: '#f59e0b',
  meeting_note: '#2dd4bf',
};

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  visibleTypes: Set<string>;
  allTypes: string[];
  onToggleType: (type: string) => void;
}

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onFit,
  visibleTypes,
  allTypes,
  onToggleType,
}: GraphControlsProps) {
  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
      {/* Type filters */}
      {allTypes.length > 0 && (
        <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-2.5 space-y-1.5">
          {allTypes.map((type) => {
            const color = TYPE_COLORS[type] ?? '#64748b';
            const visible = visibleTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => onToggleType(type)}
                className={`cursor-pointer flex items-center gap-2 w-full text-left transition-opacity ${
                  visible ? 'opacity-100' : 'opacity-30'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-text-secondary capitalize">
                  {type.replace(/_/g, ' ')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Zoom controls */}
      <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-1 flex flex-col gap-0.5">
        <button
          onClick={onZoomIn}
          className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={onZoomOut}
          className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Zoom out"
        >
          <Minus size={14} />
        </button>
        <div className="h-px bg-nativz-border mx-1" />
        <button
          onClick={onFit}
          className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Fit to view"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
