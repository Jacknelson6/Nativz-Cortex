'use client';

import { memo, useState, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow';
import { X as XIcon, Pencil, Trash2 } from 'lucide-react';

export interface LabeledEdgeData {
  label?: string | null;
  style?: 'solid' | 'dashed' | 'dotted';
  color?: string;
  dbId?: string;
  onDelete?: (dbId: string) => void;
  onUpdate?: (dbId: string, data: { label?: string | null; style?: string; color?: string }) => void;
}

const styleToStrokeDasharray: Record<string, string> = {
  solid: 'none',
  dashed: '8 4',
  dotted: '2 4',
};

function LabeledEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<LabeledEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [hovered, setHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState(data?.label || '');

  const edgeColor = data?.color || '#888888';
  const edgeStyle = data?.style || 'solid';

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(true);
  }, []);

  const handleSaveLabel = useCallback(() => {
    if (data?.dbId && data?.onUpdate) {
      data.onUpdate(data.dbId, { label: labelInput || null });
    }
    setEditingLabel(false);
    setShowMenu(false);
  }, [data, labelInput]);

  const handleDelete = useCallback(() => {
    if (data?.dbId && data?.onDelete) {
      data.onDelete(data.dbId);
    }
    setShowMenu(false);
  }, [data]);

  const cycleStyle = useCallback(() => {
    const styles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const currentIdx = styles.indexOf(edgeStyle as 'solid' | 'dashed' | 'dotted');
    const nextStyle = styles[(currentIdx + 1) % styles.length];
    if (data?.dbId && data?.onUpdate) {
      data.onUpdate(data.dbId, { style: nextStyle });
    }
  }, [data, edgeStyle]);

  const cycleColor = useCallback(() => {
    // Edge colors are stored as hex in DB and used in SVG stroke — must remain raw hex
    const colors = ['#888888', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
    const currentIdx = colors.indexOf(edgeColor);
    const nextColor = colors[(currentIdx + 1) % colors.length];
    if (data?.dbId && data?.onUpdate) {
      data.onUpdate(data.dbId, { color: nextColor });
    }
  }, [data, edgeColor]);

  return (
    <>
      {/* Invisible wider path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth: selected || hovered ? 3 : 2,
          strokeDasharray: styleToStrokeDasharray[edgeStyle] || 'none',
          transition: 'stroke-width 0.15s ease',
        }}
        markerEnd={`url(#arrow-${id})`}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        {/* Arrow marker */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker
              id={`arrow-${id}`}
              viewBox="0 0 12 12"
              refX="11"
              refY="6"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M 1 1 L 11 6 L 1 11 z" fill={edgeColor} />
            </marker>
          </defs>
        </svg>

        {/* Hover delete X + label area */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Delete X button — shows on hover */}
          {(hovered || selected) && !editingLabel && !showMenu && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              className="cursor-pointer absolute -top-3 -right-3 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors"
              title="Delete connection"
            >
              <XIcon size={10} strokeWidth={3} />
            </button>
          )}

          {editingLabel ? (
            <input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveLabel();
                if (e.key === 'Escape') { setEditingLabel(false); setShowMenu(false); }
              }}
              onBlur={handleSaveLabel}
              autoFocus
              className="rounded border border-nativz-border bg-surface px-2 py-0.5 text-xs text-text-primary outline-none focus:border-accent"
              style={{ minWidth: 60 }}
            />
          ) : data?.label ? (
            <span
              className="rounded bg-surface/90 px-1.5 py-0.5 text-[10px] text-text-secondary border border-nativz-border cursor-pointer"
              onDoubleClick={() => { setLabelInput(data.label || ''); setEditingLabel(true); }}
            >
              {data.label}
            </span>
          ) : (
            /* Invisible hover target when there's no label */
            <div className="w-6 h-6" />
          )}

          {/* Context menu */}
          {showMenu && !editingLabel && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 rounded-lg border border-nativz-border bg-surface shadow-elevated p-1 flex flex-col gap-0.5 min-w-[120px]">
              <button
                onClick={() => { setLabelInput(data?.label || ''); setEditingLabel(true); }}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                <Pencil size={12} /> Edit label
              </button>
              <button
                onClick={cycleStyle}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                ── Style: {edgeStyle}
              </button>
              <button
                onClick={cycleColor}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: edgeColor }} /> Color
              </button>
              <div className="border-t border-nativz-border my-0.5" />
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 size={12} /> Delete
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-hover cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const LabeledEdge = memo(LabeledEdgeComponent);
