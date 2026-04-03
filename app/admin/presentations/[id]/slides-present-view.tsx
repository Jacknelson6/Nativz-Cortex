'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Markdown } from '@/components/ai/markdown';
import type { Slide } from './types';

const detailVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir < 0 ? 40 : -40,
    opacity: 0,
  }),
};

function shortLabel(title: string, max = 42) {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function SlidesPresentView({
  presentationId,
  deckTitle,
  slides,
}: {
  presentationId: string;
  deckTitle: string;
  slides: Slide[];
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const total = slides.length;
  const slide = slides[currentIndex] ?? slides[0];

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const exit = useCallback(() => {
    router.push(`/admin/presentations/${presentationId}`);
  }, [router, presentationId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'Escape') exit();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, exit]);

  if (total === 0 || !slide) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0b0f] flex items-center justify-center">
        <p className="text-white/50 text-sm">No slides in this presentation</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0b0f] text-white">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_70%_at_50%_-25%,rgba(56,189,248,0.14),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(99,102,241,0.06),transparent_45%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_30%,transparent_70%,rgba(0,0,0,0.35))]" aria-hidden />

      <button
        type="button"
        onClick={exit}
        className="cursor-pointer absolute top-4 right-4 z-20 rounded-full p-2.5 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Exit presentation"
      >
        <X size={20} />
      </button>

      <header className="relative shrink-0 px-4 sm:px-8 pt-7 pb-4 text-center z-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/50">{deckTitle}</p>
        <p className="text-xs text-zinc-500 mt-2">
          Step {currentIndex + 1} of {total}
          <span className="text-zinc-600"> · </span>
          <span className="text-zinc-500">Arrow keys or click steps</span>
        </p>
      </header>

      {/* Flow strip */}
      <div className="relative shrink-0 px-3 sm:px-6 border-b border-white/[0.08] bg-black/20 backdrop-blur-sm pb-4 z-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 text-center mb-3">Video pipeline</p>
        <div className="flex justify-center">
          <div className="inline-flex max-w-full overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
            <div className="flex items-stretch gap-0 px-1">
              {slides.map((s, i) => {
                const active = i === currentIndex;
                return (
                  <div key={i} className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setDirection(i > currentIndex ? 1 : -1);
                        setCurrentIndex(i);
                      }}
                      className={`cursor-pointer text-left rounded-xl border px-3 py-2.5 min-w-[118px] max-w-[168px] transition-all duration-200 ${
                        active
                          ? 'border-sky-400/50 bg-gradient-to-b from-sky-500/20 to-sky-600/5 shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_12px_40px_-12px_rgba(56,189,248,0.35)]'
                          : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'
                      }`}
                      aria-current={active ? 'step' : undefined}
                      aria-label={`Step ${i + 1}: ${s.title || 'Untitled'}`}
                    >
                      <span
                        className={`text-[10px] font-bold tabular-nums ${active ? 'text-sky-300/90' : 'text-zinc-500'}`}
                      >
                        Step {i + 1}
                      </span>
                      <p
                        className={`text-xs leading-snug mt-1 line-clamp-3 ${
                          active ? 'text-white font-medium' : 'text-zinc-400'
                        }`}
                      >
                        {shortLabel(s.title || 'Untitled', 52)}
                      </p>
                    </button>
                    {i < slides.length - 1 ? (
                      <div className="flex items-center px-0.5 sm:px-1 text-zinc-600 shrink-0" aria-hidden>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Slide canvas */}
      <div className="relative flex-1 flex items-center justify-center px-4 sm:px-8 py-5 min-h-0 overflow-hidden z-10">
        <div className="w-full max-w-[880px] min-h-0 max-h-full flex flex-col">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={detailVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-white/[0.1] bg-zinc-900/80 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_64px_-16px_rgba(0,0,0,0.65)] backdrop-blur-md overflow-y-auto max-h-[min(68vh,640px)]"
            >
              <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-sky-500/80 via-indigo-400/60 to-sky-500/40" aria-hidden />
              <div className="px-7 py-8 sm:px-10 sm:py-10">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-8 pb-6 border-b border-white/[0.08]">
                  {slide.title || 'Untitled slide'}
                </h1>

                {slide.image_url ? (
                  <div className="mb-8 rounded-xl overflow-hidden border border-white/10 bg-black/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.image_url} alt="" className="max-h-[240px] w-full object-contain" />
                  </div>
                ) : null}

                <div className="max-w-none [&_h3]:mt-8 [&_h3:first-of-type]:!mt-0">
                  <Markdown content={slide.body || '_No content._'} variant="present" />
                </div>

                {slide.notes ? (
                  <div className="mt-10 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80 mb-2">
                      Presenter notes
                    </p>
                    <p className="text-sm leading-relaxed text-zinc-300">{slide.notes}</p>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative shrink-0 flex items-center justify-between px-4 sm:px-8 py-4 border-t border-white/[0.06] bg-black/30 backdrop-blur-sm z-10">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="cursor-pointer flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <div className="flex items-center gap-1.5 max-w-[42%] flex-wrap justify-center">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDirection(i > currentIndex ? 1 : -1);
                setCurrentIndex(i);
              }}
              className={`cursor-pointer h-1.5 rounded-full transition-all ${
                i === currentIndex ? 'w-7 bg-sky-400' : 'w-1.5 bg-zinc-600 hover:bg-zinc-500'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className="cursor-pointer flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          Next
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
