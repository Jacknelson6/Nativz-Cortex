'use client';

/**
 * ShareTour — first-visit coach-mark tour for the share-link review pages.
 *
 * Inspired by the create-onboarding-video skill philosophy:
 * - punchy, one-thing-per-beat
 * - top-anchored caption band, big headline-size copy
 * - cursor leads the tap (fades in at center, slides to target in one straight line)
 * - pulsing accent ring around the focal element
 *
 * Beats are configured by data-tour selector. Steps whose target element is
 * not present in the DOM (e.g. Approve all hides when nothing is unapproved,
 * Change date hides when a post is already published) are silently skipped.
 *
 * Each consumer surface passes its own `beats` and `storageKey` so the
 * editing-share tour and the calendar-share tour gate independently.
 */

import { ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type Beat = {
  /** Selector queried via document.querySelector. First match wins. */
  target: string;
  /** Big top-of-frame headline. */
  caption: string;
  /** Sub-line under the caption. */
  detail: string;
};

/** Beats for the editing-project share link at /c/edit/[token]. */
export const EDIT_SHARE_BEATS: Beat[] = [
  {
    target: '[data-tour="approve"]',
    caption: 'Approve when it’s ready.',
    detail:
      'Hit approve on any clip you’re happy with. The editing team gets pinged the second you do.',
  },
  {
    target: '[data-tour="request-change"]',
    caption: 'Request a change.',
    detail:
      'Need a tweak? Open the comment box, drop timestamps, attach references, and the editor sees it instantly.',
  },
  {
    target: '[data-tour="approve-all"]',
    caption: 'Ship the whole batch.',
    detail:
      'When everything looks good, approve all of them in one click and we publish on schedule.',
  },
];

/** Beats for the calendar share link at /c/[token]. */
export const CALENDAR_SHARE_BEATS: Beat[] = [
  {
    target: '[data-tour="cal-approve"]',
    caption: 'Approve when it’s ready.',
    detail:
      'One tap signs off on a post. The team gets pinged the moment you do.',
  },
  {
    target: '[data-tour="cal-request-change"]',
    caption: 'Request a change.',
    detail:
      'Need a tweak? Drop a note, timestamps, or references and the editor sees it instantly.',
  },
  {
    target: '[data-tour="cal-caption"]',
    caption: 'Edit the caption.',
    detail:
      'Tweak copy, hashtags, or hooks inline. We log the before/after so the editor can see exactly what you changed.',
  },
  {
    target: '[data-tour="cal-schedule"]',
    caption: 'Change the post date.',
    detail:
      'Need it later or sooner? Pick a new date and time. The schedule updates everywhere automatically.',
  },
  {
    target: '[data-tour="cal-collab"]',
    caption: 'Add tags and collaborators.',
    detail:
      'Tag people in the post or pull in a collab handle so it shows up on their profile too.',
  },
  {
    target: '[data-tour="cal-approve-all"]',
    caption: 'Ship the whole month.',
    detail:
      'When everything looks good, approve all of them in one click and we publish on schedule.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readSeen(key: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

function markSeen(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // ignore
  }
}

interface ShareTourProps {
  enabled: boolean;
  /** Beat list to play. Steps with missing targets are auto-skipped. */
  beats: Beat[];
  /** localStorage key for the seen flag. Use a distinct key per surface. */
  storageKey: string;
}

export function ShareTour({ enabled, beats, storageKey }: ShareTourProps) {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cursorPhase, setCursorPhase] = useState<'enter' | 'travel' | 'rest'>('enter');
  const targetElRef = useRef<HTMLElement | null>(null);

  // Decide whether to start. Only on the first eligible mount.
  useEffect(() => {
    if (!enabled) return;
    if (readSeen(storageKey)) return;
    // Wait a tick so anchor elements are rendered.
    const t = window.setTimeout(() => setActive(true), 350);
    return () => window.clearTimeout(t);
  }, [enabled, storageKey]);

  // Resolve the visible beat index, advancing past missing targets.
  const resolveStep = useCallback(
    (from: number): number => {
      for (let i = from; i < beats.length; i += 1) {
        const el = document.querySelector<HTMLElement>(beats[i].target);
        if (el) return i;
      }
      return -1;
    },
    [beats],
  );

  const close = useCallback(() => {
    markSeen(storageKey);
    setActive(false);
    targetElRef.current = null;
  }, [storageKey]);

  const advance = useCallback(() => {
    setStepIdx((prev) => {
      const next = resolveStep(prev + 1);
      if (next === -1) {
        markSeen(storageKey);
        setActive(false);
        return prev;
      }
      return next;
    });
  }, [resolveStep, storageKey]);

  // When the tour activates, snap to the first available beat.
  useEffect(() => {
    if (!active) return;
    const first = resolveStep(0);
    if (first === -1) {
      markSeen(storageKey);
      setActive(false);
      return;
    }
    setStepIdx(first);
  }, [active, resolveStep, storageKey]);

  // Track the current target's bounding rect. Recomputes on resize, scroll,
  // and via a ResizeObserver on the target itself.
  useLayoutEffect(() => {
    if (!active) return;
    const beat = beats[stepIdx];
    if (!beat) return;
    const el = document.querySelector<HTMLElement>(beat.target);
    if (!el) {
      // Target disappeared between steps; advance.
      const next = resolveStep(stepIdx + 1);
      if (next === -1) {
        markSeen(storageKey);
        setActive(false);
      } else if (next !== stepIdx) {
        setStepIdx(next);
      }
      return;
    }
    targetElRef.current = el;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    update();
    setCursorPhase('enter');
    const enterT = window.setTimeout(() => setCursorPhase('travel'), 200);
    const restT = window.setTimeout(() => setCursorPhase('rest'), 900);

    const onResize = () => update();
    const onScroll = () => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      ro.disconnect();
      window.clearTimeout(enterT);
      window.clearTimeout(restT);
    };
  }, [active, stepIdx, resolveStep, beats, storageKey]);

  // Esc to dismiss.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, advance, close]);

  const stepsTotal = useMemo(
    () => beats.filter((b) => document.querySelector(b.target)).length,
    // re-run when active changes so we count after mount
    // and when the step changes in case targets toggle in/out
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, stepIdx, beats],
  );
  const stepsBefore = useMemo(
    () =>
      beats.slice(0, stepIdx).filter((b) => document.querySelector(b.target))
        .length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, stepIdx, beats],
  );
  const isLast = stepIdx >= 0 && resolveStep(stepIdx + 1) === -1;

  if (!active || !rect) return null;

  const beat = beats[stepIdx];
  if (!beat) return null;

  const ringPad = 10;
  const ringStyle = {
    top: rect.top - ringPad,
    left: rect.left - ringPad,
    width: rect.width + ringPad * 2,
    height: rect.height + ringPad * 2,
  };

  // Cursor target: bottom-right inside the ring (where a tap would land
  // visually). During 'enter' it sits at the ring center. During 'travel'
  // and 'rest' it lives at the action point.
  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  const action = {
    x: rect.left + rect.width * 0.62,
    y: rect.top + rect.height * 0.62,
  };
  const cursorPos = cursorPhase === 'enter' ? center : action;
  const cursorOpacity = cursorPhase === 'enter' ? 0 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1000]"
      role="dialog"
      aria-modal="true"
      aria-label="Share link tour"
    >
      {/* Dimmer with a punched-out hole over the focal element */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <mask id="share-tour-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={ringStyle.left}
              y={ringStyle.top}
              width={ringStyle.width}
              height={ringStyle.height}
              rx="14"
              ry="14"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(8, 12, 20, 0.62)"
          mask="url(#share-tour-hole)"
        />
      </svg>

      {/* Pulsing ring around the focal element */}
      <div
        className="pointer-events-none absolute rounded-[14px] ring-2 ring-accent/80 shadow-[0_0_0_6px_rgba(56,135,255,0.18)] transition-[top,left,width,height] duration-300 ease-out"
        style={ringStyle}
      >
        <div className="absolute inset-0 animate-[shareTourPulse_1.6s_ease-out_infinite] rounded-[14px] ring-2 ring-accent/40" />
      </div>

      {/* Cursor: fades in at center, glides to action point in one straight line */}
      <div
        className="absolute transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          top: cursorPos.y,
          left: cursorPos.x,
          opacity: cursorOpacity,
          transform: 'translate(-30%, -30%)',
        }}
      >
        <CursorGlyph />
      </div>

      {/* Top caption band */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pt-[max(env(safe-area-inset-top),24px)]">
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-nativz-border bg-surface/95 px-5 py-4 text-center shadow-[var(--shadow-card-hover)] backdrop-blur-md">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Quick tour {stepsBefore + 1} / {stepsTotal}
          </div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {beat.caption}
          </h2>
          <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-text-secondary">
            {beat.detail}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3 py-1.5 text-xs font-medium text-text-muted transition-all hover:bg-surface-hover hover:text-text-secondary"
            >
              <X size={12} /> Skip
            </button>
            <button
              type="button"
              onClick={() => (isLast ? close() : advance())}
              className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              autoFocus
            >
              {isLast ? 'Got it' : 'Next'}
              {!isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>

      {/* Local keyframes for the secondary pulse ring */}
      <style jsx>{`
        @keyframes shareTourPulse {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          70% {
            transform: scale(1.08);
            opacity: 0;
          }
          100% {
            transform: scale(1.08);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function CursorGlyph() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}
      aria-hidden
    >
      <path
        d="M5 3l5 16 2.6-6.4L19 11 5 3z"
        fill="white"
        stroke="rgba(8,12,20,0.85)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
