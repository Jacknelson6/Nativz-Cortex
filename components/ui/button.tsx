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

// Primary = brand accent (cyan in Nativz, teal in Anderson). Sentence-case sans
// matches secondary/ghost so all buttons share one type rhythm; emphasis comes
// from color, not casing. Danger stays red.
const variantStyles: Record<Variant, string> = {
  primary:
    'bg-accent text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)]',
  secondary: 'bg-surface-hover text-text-primary hover:bg-nativz-border',
  outline: 'border border-nativz-border text-text-secondary hover:bg-surface-hover',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  danger: 'bg-[color:var(--error)] text-white hover:bg-[color:var(--error-hover)]',
};

const sizeStyles: Record<Size, string> = {
  xs: 'px-2 py-1 text-[10px]',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

// Button shape routes through --nz-btn-radius so each brand mode can pick.
// Nativz: --nz-btn-radius = 9999px (pill). Anderson: overrides to 0 (rectangle).
// `pill` variant is an explicit always-pill opt-in that ignores the brand.
const shapeStyles: Record<Shape, string> = {
  default: 'rounded-[var(--nz-btn-radius)]',
  pill: 'rounded-full',
};

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]';

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
          'inline-flex items-center justify-center gap-2 font-medium cursor-pointer whitespace-nowrap',
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
