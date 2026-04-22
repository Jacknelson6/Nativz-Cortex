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
        {/* Icon tile is a full circle per Nativz brand guide (icon backings
            beside labels are circles, not rounded squares). */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/20">
          <Icon size={16} className="text-accent-text" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="ui-page-title">{title}</h1>
          {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Section divider + label used between grouped content on a settings page.
 * Matches the quiet uppercase-label + hairline pattern used on the clients
 * grid, so sections don't require their own icon tiles competing with the
 * primary page header.
 */
export function SettingsSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 pb-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </h2>
        <div className="flex-1 h-px bg-nativz-border/40 ml-1" />
      </div>
      {description && (
        <p className="text-xs text-text-muted">{description}</p>
      )}
    </div>
  );
}
