import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Shape = 'default' | 'pill';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-[0_0_0_1px_rgba(43,125,233,0.5)] hover:bg-accent-hover active:scale-[0.98]',
  secondary: 'bg-white/[0.06] text-text-secondary hover:bg-white/[0.10] hover:text-text-primary',
  outline: 'border border-white/[0.10] text-text-secondary hover:bg-white/[0.04] hover:text-text-primary hover:border-white/[0.15]',
  ghost: 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary',
  danger: 'bg-red-500/12 text-red-400 border border-red-500/20 hover:bg-red-500/20',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

const shapeStyles: Record<Shape, string> = {
  default: 'rounded-lg',
  pill: 'rounded-full',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', shape = 'default', className = '', disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 font-medium cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none ${shapeStyles[shape]} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
