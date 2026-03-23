'use client';

import { useParams } from 'next/navigation';
import { ReactFlowProvider } from 'reactflow';
import { MoodboardCanvas } from '@/components/moodboard/moodboard-canvas';

export default function MoodboardCanvasPage() {
  const params = useParams();
  const boardId = params.id as string;

  return (
    <ReactFlowProvider>
      <MoodboardCanvas boardId={boardId} variant="analysis" />
    </ReactFlowProvider>
  );
}
