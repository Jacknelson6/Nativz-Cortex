import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  elevated?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ padding = 'md', interactive = false, elevated = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-xl border border-white/[0.06] ${elevated ? 'shadow-card' : 'shadow-xs'} ${paddingStyles[padding]} ${interactive ? 'cursor-pointer transition-all duration-200 hover:bg-white/[0.02] hover:border-white/[0.10] hover:-translate-y-px active:translate-y-0' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-lg font-semibold text-text-primary ${className}`} {...props}>
      {children}
    </h3>
  );
}
