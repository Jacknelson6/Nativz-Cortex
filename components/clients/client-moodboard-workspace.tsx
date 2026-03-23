'use client';

import { ReactFlowProvider } from 'reactflow';
import { MoodboardCanvas } from '@/components/moodboard/moodboard-canvas';

/**
 * Renders the moodboard canvas inside the client workspace shell (sidebar stays visible).
 */
export function ClientMoodboardWorkspace({
  boardId,
  clientSlug,
}: {
  boardId: string;
  clientSlug: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReactFlowProvider>
        <MoodboardCanvas boardId={boardId} variant="clientWorkspace" clientSlug={clientSlug} />
      </ReactFlowProvider>
    </div>
  );
}
