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
  eyebrow,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pb-6 mb-2 border-b border-nativz-border/60">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Icon tile is a full circle per Nativz brand guide (icon backings
              beside labels are circles, not rounded squares). */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/25">
            <Icon size={17} className="text-accent-text" />
          </div>
          <div className="min-w-0 pt-0.5 space-y-1">
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {eyebrow}
              </div>
            )}
            <h1 className="ui-page-title-md">{title}</h1>
            {subtitle && (
              <p className="text-[13px] text-text-muted leading-relaxed max-w-[62ch]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
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
