'use client';

import { memo, useState, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow';
import { Trash2, Pencil } from 'lucide-react';

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
    const colors = ['#888888', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
    const currentIdx = colors.indexOf(edgeColor);
    const nextColor = colors[(currentIdx + 1) % colors.length];
    if (data?.dbId && data?.onUpdate) {
      data.onUpdate(data.dbId, { color: nextColor });
    }
  }, [data, edgeColor]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: styleToStrokeDasharray[edgeStyle] || 'none',
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
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor} />
            </marker>
          </defs>
        </svg>

        {/* Label */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onContextMenu={handleContextMenu}
        >
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
          ) : null}

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
