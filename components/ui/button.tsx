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
  primary: 'btn-shimmer bg-gradient-to-br from-accent to-[#0580f0] text-white shadow-md',
  secondary: 'bg-surface-hover text-text-primary hover:bg-nativz-border',
  outline: 'border border-nativz-border text-text-secondary hover:bg-surface-hover',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  danger: 'bg-red-600 text-white hover:bg-red-700',
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
        className={`inline-flex items-center justify-center gap-2 font-medium cursor-pointer transition-all duration-150 hover:scale-[1.02] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none ${shapeStyles[shape]} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
