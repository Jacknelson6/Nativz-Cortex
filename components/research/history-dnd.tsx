'use client';

import { forwardRef, useCallback } from 'react';
import { useDraggable, DragOverlay } from '@dnd-kit/core';
import { cn } from '@/lib/utils/cn';

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object' && 'current' in ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

/**
 * Wraps a topic search row so the **whole row** can be dragged into folder drop targets.
 * While dragging the original fades to a ghost; a `DragOverlay` (rendered by the parent
 * `DndContext`) shows the lifted card.
 *
 * Must be rendered **outside** `ContextMenuTrigger` — Radix context menu's pointer-down
 * handler prevents dnd-kit's `PointerSensor` from activating when both share the same element.
 */
export const DraggableSearchRow = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    searchId: string;
    searchTitle: string;
    disabled: boolean;
  }
>(function DraggableSearchRow({ searchId, searchTitle, disabled, className, children, style, ...rest }, ref) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `search-${searchId}`,
    disabled,
    data: { title: searchTitle, searchId },
  });

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      assignRef(ref, node);
    },
    [ref, setNodeRef],
  );

  return (
    <div
      ref={mergedRef}
      style={style}
      className={cn(
        !disabled && 'cursor-grab active:cursor-grabbing',
        className,
        isDragging && 'pointer-events-none opacity-30',
      )}
      {...(!disabled ? { ...listeners, ...attributes } : {})}
      {...rest}
    >
      {children}
    </div>
  );
});

/**
 * Floating overlay card rendered in a portal while dragging a search row.
 * Intentionally compact — just shows the title so the user knows what they're moving.
 */
export function DragOverlayCard({ title }: { title: string }) {
  return (
    <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
      <div className="flex max-w-[240px] items-center gap-2 rounded-lg border border-accent/30 bg-surface px-3 py-2 shadow-elevated ring-1 ring-accent/10">
        <span className="truncate text-sm font-medium text-text-primary">{title}</span>
      </div>
    </DragOverlay>
  );
}
