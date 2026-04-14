'use client';

import { ReactFlowProvider } from 'reactflow';
import { MoodboardCanvas } from '@/components/moodboard/moodboard-canvas';

interface PersonalMoodboardProps {
  boardId: string;
  boardName: string;
}

/**
 * Thin client wrapper for the personal moodboard canvas. The existing
 * MoodboardCanvas handles paste-URL ingestion (see use-moodboard-data.ts
 * global paste listener), drag-drop node positioning, item deletion, and
 * the video analysis side panel. Personal boards use the same 'analysis'
 * variant as the existing /admin/moodboard/[id] flow.
 */
export function PersonalMoodboard({ boardId }: PersonalMoodboardProps) {
  return (
    <ReactFlowProvider>
      <MoodboardCanvas boardId={boardId} variant="notes" />
    </ReactFlowProvider>
  );
}
