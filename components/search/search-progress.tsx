'use client';

import { useState, useEffect } from 'react';
import { EncryptedText } from '@/components/ui/encrypted-text';

interface SearchProgressProps {
  complete?: boolean;
}

const STAGES = [
  { label: 'Searching the web...', duration: 8000, progress: 20 },
  { label: 'Analyzing discussions...', duration: 10000, progress: 40 },
  { label: 'Processing videos...', duration: 10000, progress: 60 },
  { label: 'AI is writing your report...', duration: 25000, progress: 80 },
  { label: 'Finalizing...', duration: 60000, progress: 90 },
];

export function SearchProgress({ complete = false }: SearchProgressProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    if (complete) {
      setProgress(100);
      return;
    }

    const stage = STAGES[stageIndex];
    if (!stage) return;

    // Animate progress to target
    const targetProgress = stage.progress;
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= targetProgress) return prev;
        return prev + 1;
      });
    }, stage.duration / (targetProgress - progress || 1));

    // Move to next stage
    const stageTimer = setTimeout(() => {
      if (stageIndex < STAGES.length - 1) {
        setStageIndex(stageIndex + 1);
      }
    }, stage.duration);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(stageTimer);
    };
  }, [stageIndex, complete, progress]);

  const currentStage = STAGES[Math.min(stageIndex, STAGES.length - 1)];

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-surface-hover overflow-hidden animate-pulse-glow">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-[#0580f0] transition-all duration-700 ease-out"
          style={{ width: `${complete ? 100 : progress}%` }}
        />
      </div>

      {/* Stage label */}
      <div className="mt-4 text-center min-h-[1.5rem]">
        {complete ? (
          <p className="text-sm text-text-secondary">Complete!</p>
        ) : (
          <EncryptedText
            key={currentStage.label}
            text={currentStage.label}
            revealDelayMs={40}
            className="text-sm"
          />
        )}
      </div>
    </div>
  );
}
