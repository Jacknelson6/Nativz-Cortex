'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pencil, Eraser, Trash2, X } from 'lucide-react';

type Point = { x: number; y: number };
type Stroke = { id: string; color: string; points: Point[]; width: number };

const COLORS = [
  { key: 'white', value: '#ffffff' },
  { key: 'accent', value: 'var(--accent-text)' },
  { key: 'red', value: '#f87171' },
  { key: 'amber', value: '#fbbf24' },
  { key: 'emerald', value: '#34d399' },
];

/**
 * Freeform drawing layer that sits on top of the ReactFlow canvas.
 *
 * - Strokes live in local component state and are lost on unmount.
 *   Persistence (a `moodboard_strokes` table keyed by board_id) is a
 *   follow-up pass — noted in tasks/personal-moodboards.md.
 * - When `active` is false the overlay is invisible and pointer-events:none,
 *   so ReactFlow keeps full control. When `active` is true the overlay
 *   captures pointer events so scribbles land instead of node drags.
 * - Escape or the X button exits drawing mode.
 */
export function DrawingOverlay({
  active,
  onClose,
}: {
  active: boolean;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

  const toSvgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    e.preventDefault();
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const point = toSvgPoint(e.clientX, e.clientY);
    if (tool === 'eraser') {
      // Remove the topmost stroke that the point is reasonably close to.
      setStrokes((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (strokeHitsPoint(prev[i], point, 12)) {
            return [...prev.slice(0, i), ...prev.slice(i + 1)];
          }
        }
        return prev;
      });
      return;
    }
    setCurrentStroke({
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      color,
      width: 2,
      points: [point],
    });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    const point = toSvgPoint(e.clientX, e.clientY);
    if (tool === 'eraser' && e.buttons) {
      setStrokes((prev) => prev.filter((s) => !strokeHitsPoint(s, point, 12)));
      return;
    }
    if (!currentStroke) return;
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, point] });
  };

  const onPointerUp = () => {
    if (!active) return;
    if (currentStroke && currentStroke.points.length > 1) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke(null);
  };

  const renderedPaths = useMemo(() => {
    const list = currentStroke ? [...strokes, currentStroke] : strokes;
    return list.map((s) => ({ ...s, d: pointsToPath(s.points) }));
  }, [strokes, currentStroke]);

  const clearAll = () => setStrokes([]);

  return (
    <>
      <svg
        ref={svgRef}
        aria-hidden={!active}
        className={`absolute inset-0 h-full w-full ${active ? 'cursor-crosshair' : ''}`}
        style={{ pointerEvents: active ? 'auto' : 'none', touchAction: 'none', zIndex: 20 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {renderedPaths.map((s) => (
          <path
            key={s.id}
            d={s.d}
            stroke={s.color}
            strokeWidth={s.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {active && (
        <div
          className="pointer-events-auto absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-nativz-border bg-surface/95 px-2 py-1.5 shadow-elevated backdrop-blur"
          role="toolbar"
          aria-label="Drawing tools"
        >
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer ${
              tool === 'pen' ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:bg-surface-hover'
            }`}
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer ${
              tool === 'eraser' ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:bg-surface-hover'
            }`}
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
          >
            <Eraser size={13} />
          </button>
          <div className="mx-1 h-5 w-px bg-nativz-border" />
          {COLORS.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => { setTool('pen'); setColor(c.value); }}
              className={`h-4 w-4 rounded-full border transition-transform cursor-pointer ${
                color === c.value && tool === 'pen' ? 'border-accent-text scale-110' : 'border-nativz-border hover:scale-105'
              }`}
              style={{ background: c.value }}
              aria-label={`Color ${c.key}`}
            />
          ))}
          <div className="mx-1 h-5 w-px bg-nativz-border" />
          <button
            type="button"
            onClick={clearAll}
            className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary cursor-pointer"
            aria-label="Clear all strokes"
          >
            <Trash2 size={12} />
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary cursor-pointer"
            aria-label="Exit drawing mode"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  );
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const { x, y } = points[0];
    return `M ${x} ${y} L ${x + 0.1} ${y + 0.1}`;
  }
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

function strokeHitsPoint(stroke: Stroke, point: Point, tolerance: number): boolean {
  for (const p of stroke.points) {
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    if (dx * dx + dy * dy <= tolerance * tolerance) return true;
  }
  return false;
}
