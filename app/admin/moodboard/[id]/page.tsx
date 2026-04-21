'use client';

import { useParams } from 'next/navigation';
import { ReactFlowProvider } from 'reactflow';
import { MoodboardCanvas } from '@/components/moodboard/moodboard-canvas';

export default function MoodboardCanvasPage() {
  const params = useParams();
  const boardId = params.id as string;

  return (
    <ReactFlowProvider>
      {/* `syncAdminBrand` tells the canvas to mount <SyncActiveBrand/> once
       *  the board's client_id resolves — admin-only because portal doesn't
       *  wrap with ActiveBrandProvider. */}
      <MoodboardCanvas boardId={boardId} variant="analysis" syncAdminBrand />
    </ReactFlowProvider>
  );
}
