// components/research/wizard-shell.tsx
'use client';

import { useEffect, useRef, useLayoutEffect, useState, Children, type ReactNode } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { lockScroll, unlockScroll } from '@/lib/utils/scroll-lock';

function StepBar({ total, current, accentColor }: { total: number; current: number; accentColor: string }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="h-1 flex-1 rounded-full"
          animate={{
            backgroundColor: i < current ? accentColor : 'rgba(255,255,255,0.08)',
          }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}

const stepVariants: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-50%' : '50%', opacity: 0 }),
};

function SlideTransition({
  children,
  direction,
  onHeightReady,
}: {
  children: ReactNode;
  direction: number;
  onHeightReady: (h: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    onHeightReady(ref.current.offsetHeight);

    // Observe size changes (e.g. context mode toggle reveals/hides inputs)
    const observer = new ResizeObserver(() => {
      if (ref.current) onHeightReady(ref.current.offsetHeight);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
      style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

interface WizardShellProps {
  open: boolean;
  onClose: () => void;
  accentColor: string;
  totalSteps: number;
  currentStep: number;
  children: ReactNode;
}

export function WizardShell({ open, onClose, accentColor, totalSteps, currentStep, children }: WizardShellProps) {
  const [direction, setDirection] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const prevStep = useRef(currentStep);

  useEffect(() => {
    setDirection(currentStep > prevStep.current ? 1 : -1);
    prevStep.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return () => unlockScroll();
  }, [open]);

  const stepsArray = Children.toArray(children);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-surface shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
          >
            <div className="p-7">
              <StepBar total={totalSteps} current={currentStep} accentColor={accentColor} />
              <motion.div
                style={{ position: 'relative', overflow: 'hidden' }}
                animate={{ height: contentHeight }}
                transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
              >
                <AnimatePresence initial={false} mode="sync" custom={direction}>
                  <SlideTransition
                    key={currentStep}
                    direction={direction}
                    onHeightReady={setContentHeight}
                  >
                    {stepsArray[currentStep - 1]}
                  </SlideTransition>
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
