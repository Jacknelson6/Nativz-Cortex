'use client';

import { memo } from 'react';
import { type Node } from 'reactflow';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  ArrowLeftRight,
  ArrowUpDown,
} from 'lucide-react';

interface SelectionToolbarProps {
  selectedNodes: Node[];
  onUpdatePositions: (updates: Array<{ id: string; x: number; y: number }>) => void;
}

function SelectionToolbarComponent({ selectedNodes, onUpdatePositions }: SelectionToolbarProps) {
  if (selectedNodes.length < 2) return null;

  const getPositions = () => selectedNodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    w: (n.style?.width as number) || 320,
    h: (n.style?.height as number) || 400,
  }));

  const alignLeft = () => {
    const positions = getPositions();
    const minX = Math.min(...positions.map((p) => p.x));
    onUpdatePositions(positions.map((p) => ({ id: p.id, x: minX, y: p.y })));
  };

  const alignCenterH = () => {
    const positions = getPositions();
    const centers = positions.map((p) => p.x + p.w / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    onUpdatePositions(positions.map((p) => ({ id: p.id, x: avgCenter - p.w / 2, y: p.y })));
  };

  const alignRight = () => {
    const positions = getPositions();
    const maxRight = Math.max(...positions.map((p) => p.x + p.w));
    onUpdatePositions(positions.map((p) => ({ id: p.id, x: maxRight - p.w, y: p.y })));
  };

  const alignTop = () => {
    const positions = getPositions();
    const minY = Math.min(...positions.map((p) => p.y));
    onUpdatePositions(positions.map((p) => ({ id: p.id, x: p.x, y: minY })));
  };

  const alignMiddle = () => {
    const positions = getPositions();
    const centers = positions.map((p) => p.y + p.h / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    onUpdatePositions(positions.map((p) => ({ id: p.id, x: p.x, y: avgCenter - p.h / 2 })));
  };

  const alignBottom = () => {
    const positions = getPositions();
    const maxBottom = Math.max(...positions.map((p) => p.y + p.h));
    onUpdatePositions(positions.map((p) => ({ id: p.id, x: p.x, y: maxBottom - p.h })));
  };

  const distributeH = () => {
    const positions = getPositions().sort((a, b) => a.x - b.x);
    if (positions.length < 3) return;
    const totalWidth = positions.reduce((a, p) => a + p.w, 0);
    const totalSpan = positions[positions.length - 1].x + positions[positions.length - 1].w - positions[0].x;
    const gap = (totalSpan - totalWidth) / (positions.length - 1);
    let currentX = positions[0].x;
    onUpdatePositions(positions.map((p) => {
      const update = { id: p.id, x: currentX, y: p.y };
      currentX += p.w + gap;
      return update;
    }));
  };

  const distributeV = () => {
    const positions = getPositions().sort((a, b) => a.y - b.y);
    if (positions.length < 3) return;
    const totalHeight = positions.reduce((a, p) => a + p.h, 0);
    const totalSpan = positions[positions.length - 1].y + positions[positions.length - 1].h - positions[0].y;
    const gap = (totalSpan - totalHeight) / (positions.length - 1);
    let currentY = positions[0].y;
    onUpdatePositions(positions.map((p) => {
      const update = { id: p.id, x: p.x, y: currentY };
      currentY += p.h + gap;
      return update;
    }));
  };

  const buttons = [
    { icon: AlignStartVertical, label: 'Align left', action: alignLeft },
    { icon: AlignCenterVertical, label: 'Align center', action: alignCenterH },
    { icon: AlignEndVertical, label: 'Align right', action: alignRight },
    { icon: AlignStartHorizontal, label: 'Align top', action: alignTop },
    { icon: AlignCenterHorizontal, label: 'Align middle', action: alignMiddle },
    { icon: AlignEndHorizontal, label: 'Align bottom', action: alignBottom },
    { icon: ArrowLeftRight, label: 'Distribute horizontally', action: distributeH },
    { icon: ArrowUpDown, label: 'Distribute vertically', action: distributeV },
  ];

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-xl border border-nativz-border bg-surface/95 backdrop-blur-sm px-2 py-1.5 shadow-elevated">
      <span className="text-[10px] text-text-muted mr-1.5">{selectedNodes.length} selected</span>
      {buttons.map(({ icon: Icon, label, action }, i) => (
        <button
          key={label}
          onClick={action}
          title={label}
          className={`cursor-pointer rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors ${
            i === 3 ? 'ml-1.5 border-l border-nativz-border pl-2' : ''
          } ${i === 6 ? 'ml-1.5 border-l border-nativz-border pl-2' : ''}`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

export const SelectionToolbar = memo(SelectionToolbarComponent);
