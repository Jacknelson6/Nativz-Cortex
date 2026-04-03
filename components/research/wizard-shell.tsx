// components/research/wizard-shell.tsx
'use client';

import { useEffect, useRef, useLayoutEffect, useState, Children, type ReactNode } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { lockScroll, unlockScroll } from '@/lib/utils/scroll-lock';

function StepBar({ total, current, accentColor, stepLabels }: { total: number; current: number; accentColor: string; stepLabels?: string[] }) {
  return (
    <div className="mb-6">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < current ? '' : 'bg-nativz-border'
            }`}
            style={i < current ? { backgroundColor: accentColor } : undefined}
          />
        ))}
      </div>
      {stepLabels && stepLabels.length > 0 && (
        <div className="flex gap-1.5 mt-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="flex-1 text-center">
              {stepLabels[i] && (
                <span className={`text-xs ${i < current ? 'text-text-secondary' : 'text-text-muted'}`}>
                  {stepLabels[i]}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
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

    const measure = () => {
      if (ref.current) onHeightReady(ref.current.offsetHeight);
    };
    measure();
    // Defer one frame so max-height / overflow on descendants (e.g. scrollable lists) is applied before we size the shell
    const raf = requestAnimationFrame(measure);

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    observer.observe(ref.current);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
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

type WizardShellLayout = 'modal' | 'inline';

interface WizardShellProps {
  open: boolean;
  onClose: () => void;
  accentColor: string;
  totalSteps: number;
  currentStep: number;
  children: ReactNode;
  /** Optional labels shown below each step dot. */
  stepLabels?: string[];
  /** `inline` = embedded in a page (no overlay, no scroll lock). Default `modal`. */
  layout?: WizardShellLayout;
  /** Wrapper classes when `layout="inline"` */
  className?: string;
}

export function WizardShell({
  open,
  onClose,
  accentColor,
  totalSteps,
  currentStep,
  children,
  stepLabels,
  layout = 'modal',
  className = '',
}: WizardShellProps) {
  const [direction, setDirection] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const prevStep = useRef(currentStep);

  useEffect(() => {
    setDirection(currentStep > prevStep.current ? 1 : -1);
    prevStep.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (!open || layout !== 'modal') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, layout]);

  useEffect(() => {
    if (!open || layout !== 'modal') return;
    lockScroll();
    return () => unlockScroll();
  }, [open, layout]);

  const stepsArray = Children.toArray(children);

  const stepBody = (
    <div className={layout === 'modal' ? 'p-7' : 'p-6 sm:p-8'}>
      <StepBar total={totalSteps} current={currentStep} accentColor={accentColor} stepLabels={stepLabels} />
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
  );

  if (layout === 'inline') {
    if (!open) return null;
    return (
      <div className={className}>
        <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden shadow-[0_24px_64px_-32px_rgba(0,0,0,0.55)]">
          {stepBody}
        </div>
      </div>
    );
  }

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
            {stepBody}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
