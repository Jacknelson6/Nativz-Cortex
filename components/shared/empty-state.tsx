import { ReactNode } from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void } | ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-xl bg-surface-hover p-4 text-text-muted">
        {icon}
      </div>
      <h3 className="text-base font-medium text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {isActionConfig(action) ? (
            action.href ? (
              <Link
                href={action.href}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-surface/80 transition-colors"
              >
                {action.label}
              </Link>
            ) : (
              <button
                onClick={action.onClick}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-surface/80 transition-colors"
              >
                {action.label}
              </button>
            )
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}

function isActionConfig(
  action: unknown,
): action is { label: string; href?: string; onClick?: () => void } {
  return typeof action === 'object' && action !== null && 'label' in action;
}
