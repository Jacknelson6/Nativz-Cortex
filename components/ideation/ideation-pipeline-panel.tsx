'use client';

import Link from 'next/link';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IdeationPipelinePanelProps {
  searchId: string;
  clientId: string | null;
}

/**
 * End-of-results "next step" band. Renders as a full-width section — not a
 * floating card — so it reads as the natural continuation of the research
 * page rather than a bolted-on marketing module. Cyan hairline eyebrow +
 * Jost headline + one-line explanation + a single filled CTA pill.
 *
 * The three bullet chips below the headline make the abstract "Strategy
 * Lab" product tangible by showing the three things it actually produces
 * from a topic search — scripts, content pillars, and full ideation runs.
 */
export function IdeationPipelinePanel({
  searchId,
  clientId,
}: IdeationPipelinePanelProps) {
  const labHref = clientId
    ? `/admin/strategy-lab/${clientId}?searchId=${searchId}`
    : `/admin/strategy-lab?searchId=${searchId}`;

  return (
    <section className="relative mx-auto w-full overflow-hidden rounded-xl border border-cyan-500/20 bg-surface">
      {/* Soft cyan glow in the corner — signals "this is the Nativz next
          step", without the gradient banner feel of the old panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex min-w-0 items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/20">
            <FlaskConical size={20} aria-hidden />
          </span>
          <div className="min-w-0 space-y-2">
            <p
              className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/90"
              style={{ fontFamily: 'Rubik, system-ui, sans-serif', fontStyle: 'italic' }}
            >
              Next step
            </p>
            <h3
              className="text-xl font-semibold leading-snug text-text-primary sm:text-2xl"
              style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
            >
              Turn these findings into a content plan.
            </h3>
            <p
              className="max-w-xl text-sm leading-relaxed text-white/75"
              style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
            >
              Strategy Lab pulls this research into a chat-native workspace where you can draft
              scripts, map content pillars, and hand off a shoot-ready brief.
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-text-muted">
              <li className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-400/70" aria-hidden />
                Short-form scripts
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-400/70" aria-hidden />
                Content pillar map
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-400/70" aria-hidden />
                Ideation brief
              </li>
            </ul>
          </div>
        </div>

        <div className="shrink-0">
          <Link href={labHref}>
            <Button type="button" variant="primary" size="md" className="gap-2 whitespace-nowrap">
              Open Strategy Lab
              <ArrowRight size={15} />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
