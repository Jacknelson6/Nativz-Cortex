import type { LucideIcon } from 'lucide-react';

/**
 * Page-top header for client settings pages. Renders an icon tile + title +
 * subtitle, with an optional right-side action slot (typically Edit / Save /
 * Cancel buttons). Matches the icon-tile + title pattern from the reference
 * design while preserving our color palette + rounded corners.
 */
export function SettingsPageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-surface border border-nativz-border">
          <Icon size={20} className="text-accent-text" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
          {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
