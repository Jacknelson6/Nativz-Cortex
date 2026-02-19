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
      className={`bg-surface rounded-xl border border-nativz-border ${elevated ? 'shadow-elevated' : 'shadow-card'} ${paddingStyles[padding]} ${interactive ? 'cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:border-accent/40 active:scale-[0.995]' : ''} ${className}`}
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
