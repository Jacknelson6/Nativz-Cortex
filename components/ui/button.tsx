import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md' | 'lg';
type Shape = 'default' | 'pill';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
}

// Primary = Nativz flat purple CTA. Uppercase Jost-700, 2px letter-spacing.
// Secondary/outline/ghost stay neutral so non-primary actions don't compete
// with primary CTAs. Danger stays red for destructive semantics.
const variantStyles: Record<Variant, string> = {
  primary:
    'bg-[color:var(--nz-purple)] text-white shadow-[var(--shadow-card)] hover:bg-[color:var(--nz-purple-700)] hover:shadow-[var(--shadow-card-hover)] nz-btn-label',
  secondary: 'bg-surface-hover text-text-primary hover:bg-nativz-border',
  outline: 'border border-nativz-border text-text-secondary hover:bg-surface-hover',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  danger: 'bg-[color:var(--error)] text-white hover:bg-[color:var(--error-hover)]',
};

// Size scale — primary (nz-btn-label) uses uppercase so sizes stay the same,
// but visual weight reads bigger. Preserve the existing px/py scale so
// existing layouts don't reflow.
const sizeStyles: Record<Size, string> = {
  xs: 'px-2 py-1 text-[10px]',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

// Nativz signature: action buttons are full-pill shapes. `default` maps to
// pill to match the brand; `pill` is an explicit alias. The older rounded-lg
// look is kept via the `rectangle` opt-out for contexts where a pill would
// feel wrong (e.g. dense toolbar buttons).
const shapeStyles: Record<Shape, string> = {
  default: 'rounded-full',
  pill: 'rounded-full',
};

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nz-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', shape = 'default', className, disabled, children, type = 'button', ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium cursor-pointer',
          'transition-all duration-[var(--duration-fast)] ease-out',
          'active:scale-[0.98]',
          focusRing,
          'disabled:opacity-50 disabled:pointer-events-none',
          shapeStyles[shape],
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
