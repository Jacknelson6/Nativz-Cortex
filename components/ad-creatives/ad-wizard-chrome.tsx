'use client';

import { Fragment, type ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Step metadata — single source for titles, progress labels, descriptions
// ---------------------------------------------------------------------------

export const AD_WIZARD_STEP_META = [
  {
    id: 'brand' as const,
    title: 'Brand & assets',
    shortTitle: 'Brand',
    description: 'Confirm Brand DNA and add creative reference files if you want extra assets for generation.',
  },
  {
    id: 'products' as const,
    title: 'Products & services',
    shortTitle: 'Products',
    description: 'Choose what to feature. We use these for product context in prompts and layouts.',
  },
  {
    id: 'templates' as const,
    title: 'Templates',
    shortTitle: 'Templates',
    description: '',
  },
  {
    id: 'format' as const,
    title: 'Aspect ratio',
    shortTitle: 'Format',
    description: 'Match the shape to Meta, Stories, or feed placements.',
  },
  {
    id: 'offers' as const,
    title: 'Offers',
    shortTitle: 'Offers',
    description: 'Optional sale or promo line so copy and prompts stay accurate.',
  },
  {
    id: 'copy' as const,
    title: 'Headline, subheadline & CTA',
    shortTitle: 'Copy',
    description: 'Headline and subheadline first (unique per ad with AI); one shared call to action for the batch.',
  },
  {
    id: 'generate' as const,
    title: 'Generate',
    shortTitle: 'Generate',
    description: 'Confirm variation counts, then run the batch or review prompts first.',
  },
] as const;

export type AdWizardStepId = (typeof AD_WIZARD_STEP_META)[number]['id'];

// ---------------------------------------------------------------------------
// Progress — desktop: connected steps; mobile: bar + step count
// ---------------------------------------------------------------------------

interface AdWizardProgressProps {
  currentIndex: number;
  onStepClick?: (index: number) => void;
}

export function AdWizardProgress({ currentIndex, onStepClick }: AdWizardProgressProps) {
  const total = AD_WIZARD_STEP_META.length;
  const pct = ((currentIndex + 1) / total) * 100;

  return (
    <div className="w-full space-y-4">
      <div className="md:hidden space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>
            Step {currentIndex + 1} of {total}
          </span>
          <span className="truncate text-right font-medium text-text-secondary">
            {AD_WIZARD_STEP_META[currentIndex]?.title}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-background border border-nativz-border overflow-hidden">
          <div
            className="h-full rounded-full bg-accent/90 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="hidden md:flex items-stretch gap-0 w-full overflow-x-auto pb-1 scrollbar-thin -mx-1 px-1">
        {AD_WIZARD_STEP_META.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const clickable = onStepClick && i < currentIndex;

          return (
            <Fragment key={step.id}>
              {i > 0 && (
                <div
                  className={cn(
                    'flex-1 min-w-[6px] self-center h-0.5 mx-0.5 rounded-full transition-colors',
                    done || active ? 'bg-accent-border/50' : 'bg-nativz-border',
                  )}
                  aria-hidden
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(i)}
                className={cn(
                  'group flex flex-col items-center gap-1.5 shrink-0 min-w-[52px] max-w-[88px] transition-colors',
                  clickable && 'cursor-pointer',
                  !clickable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all',
                    active &&
                      'border-accent-border bg-accent-surface text-accent-text shadow-[0_0_0_1px_rgba(59,130,246,0.2)]',
                    done &&
                      !active &&
                      'border-accent-border/45 bg-accent/12 text-accent-text',
                    !done && !active && 'border-nativz-border/60 bg-background/50 text-text-muted',
                  )}
                >
                  {done && !active ? (
                    <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden />
                  ) : (
                    <span aria-hidden>{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-medium text-center leading-tight px-0.5 transition-colors',
                    active && 'text-accent-text',
                    done && !active && 'text-text-secondary',
                    !done && !active && 'text-text-muted',
                    clickable && 'group-hover:text-text-primary',
                  )}
                >
                  {step.shortTitle}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step title + description (sentence case)
// ---------------------------------------------------------------------------

export function WizardStepHeader({
  title,
  description,
  aside,
}: {
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  const showDescription = description.trim().length > 0;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-nativz-border/80 pb-4 mb-6">
      <div className={`min-w-0 ${showDescription ? 'space-y-1.5' : ''}`}>
        <h2 className="text-base font-semibold text-text-primary tracking-tight">{title}</h2>
        {showDescription ? (
          <p className="text-sm text-text-muted leading-relaxed max-w-2xl">{description}</p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control — shared chrome for template source, copy mode, etc.
// ---------------------------------------------------------------------------

export function WizardSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex w-full rounded-xl border border-nativz-border bg-background/50 p-1 gap-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]',
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all cursor-pointer min-h-[42px]',
              active
                ? 'bg-surface text-text-primary border border-nativz-border shadow-sm'
                : 'text-text-muted border border-transparent hover:text-text-secondary hover:bg-background/80',
            )}
          >
            {Icon ? <Icon size={14} className="shrink-0 opacity-85" aria-hidden /> : null}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell — gradient hairline + card
// ---------------------------------------------------------------------------

export function AdWizardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-[0_24px_64px_-24px_rgba(0,0,0,0.55)]',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-border/40 to-transparent"
        aria-hidden
      />
      <div className="relative p-5 sm:p-6 md:p-8 min-h-[320px]">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer actions — consistent bar under the card
// ---------------------------------------------------------------------------

export function AdWizardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 flex flex-col-reverse gap-3 border-t border-nativz-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}
