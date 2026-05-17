import type { LucideIcon } from 'lucide-react';

/**
 * Page-top header for client settings pages. Dovetail-style: a clean H1
 * with a small subtitle beneath, no icon tile, no eyebrow. Each card on
 * the page carries its own in-card title; this header just identifies
 * the current subpage.
 *
 * `icon` is accepted for API compatibility with older call sites but is
 * intentionally not rendered.
 */
export function SettingsPageHeader({
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pb-4 mb-2 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[22px] sm:text-[26px] font-semibold text-text-primary leading-tight tracking-[-0.01em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-text-muted leading-relaxed max-w-[62ch]">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
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
