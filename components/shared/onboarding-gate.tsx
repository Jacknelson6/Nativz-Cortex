import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';

interface OnboardingGateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
}

export interface OnboardingGateProps {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  bullets?: string[];
  primary: OnboardingGateAction;
  secondary?: OnboardingGateAction;
  /** Optional footnote rendered below the actions in muted text. */
  footnote?: ReactNode;
  /** Constrains content max-width — default 28rem fits most copy without
   *  forcing the centered icon to look stranded. */
  maxWidth?: 'sm' | 'md' | 'lg';
  className?: string;
}

const MAX_W: Record<NonNullable<OnboardingGateProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * Primitive empty-state used for "this area needs to be set up first" gates.
 * One CTA opens the wizard / kicks the setup flow; an optional secondary
 * action covers "do this later" or "I'm not the right person."
 *
 * Visual rhythm matches the rest of the app — accent-surface icon bubble,
 * sentence-case copy, dark theme tokens, never wraps the primary button.
 *
 * Use this anywhere a feature is brand-scoped and the active brand has not
 * completed the precondition (e.g. Spy without a baseline benchmark, Analytics
 * without a connected account).
 */
export function OnboardingGate({
  icon,
  eyebrow,
  title,
  description,
  bullets,
  primary,
  secondary,
  footnote,
  maxWidth = 'md',
  className,
}: OnboardingGateProps) {
  return (
    <section
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface text-accent-text',
          'mb-6',
        )}
        aria-hidden
      >
        {icon}
      </div>

      {eyebrow ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-text">
          {eyebrow}
        </p>
      ) : null}

      <h2 className={cn('text-xl font-semibold text-text-primary', MAX_W[maxWidth])}>
        {title}
      </h2>

      {description ? (
        <p className={cn('mt-3 text-sm leading-relaxed text-text-muted', MAX_W[maxWidth])}>
          {description}
        </p>
      ) : null}

      {bullets && bullets.length > 0 ? (
        <ul
          className={cn(
            'mt-6 grid gap-2 text-left text-sm text-text-secondary',
            MAX_W[maxWidth],
          )}
        >
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
              <span className="leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <PrimaryAction action={primary} />
        {secondary ? <SecondaryAction action={secondary} /> : null}
      </div>

      {footnote ? (
        <p className={cn('mt-5 text-xs text-text-muted', MAX_W[maxWidth])}>{footnote}</p>
      ) : null}
    </section>
  );
}

function PrimaryAction({ action }: { action: OnboardingGateAction }) {
  const content = action.loading ? 'Working…' : action.label;
  if (action.href) {
    return (
      <a
        href={action.href}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nz-btn-radius)] bg-accent px-4 py-2 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)]"
      >
        {content}
      </a>
    );
  }
  return (
    <Button
      type="button"
      variant="primary"
      size="md"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
    >
      {content}
    </Button>
  );
}

function SecondaryAction({ action }: { action: OnboardingGateAction }) {
  if (action.href) {
    return (
      <a
        href={action.href}
        className="text-sm text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
      >
        {action.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      className="text-sm text-text-muted underline-offset-4 hover:text-text-primary hover:underline disabled:opacity-50"
    >
      {action.label}
    </button>
  );
}
