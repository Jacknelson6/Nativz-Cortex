'use client';

import { useEffect, useCallback, useRef } from 'react';
import { type Node, type Edge, useReactFlow } from 'reactflow';

interface ShortcutHandlers {
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onDuplicateSelected: () => void;
  onUndo: () => void;
  onAddNote: () => void;
  onDeselectAll: () => void;
}

export function useMoodboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const isMod = e.metaKey || e.ctrlKey;

      // Delete/Backspace — delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handlersRef.current.onDeleteSelected();
        return;
      }

      // Cmd + A — select all
      if (isMod && e.key === 'a') {
        e.preventDefault();
        handlersRef.current.onSelectAll();
        return;
      }

      // Cmd + D — duplicate selected
      if (isMod && e.key === 'd') {
        e.preventDefault();
        handlersRef.current.onDuplicateSelected();
        return;
      }

      // Cmd + Z — undo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handlersRef.current.onUndo();
        return;
      }

      // N — add sticky note
      if (e.key === 'n' || e.key === 'N') {
        if (!isMod) {
          e.preventDefault();
          handlersRef.current.onAddNote();
          return;
        }
      }

      // Escape — deselect all
      if (e.key === 'Escape') {
        handlersRef.current.onDeselectAll();
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
