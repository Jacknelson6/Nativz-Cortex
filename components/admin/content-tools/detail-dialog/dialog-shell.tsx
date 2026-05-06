'use client';

import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { SubNav } from '@/components/ui/sub-nav';
import { ClientLogo } from '@/components/clients/client-logo';

/**
 * Chassis for the content-tools detail dialogs. Both row types in the
 * unified review table (calendar share links + editing projects) open
 * into this same shell so they read as one product. Differences live in
 * the slots:
 *
 *   - `title`        : `<input>` (editable rename) for editing projects,
 *                      static text + StatusPill for calendar share links.
 *   - `headerExtras` : right-rail header content (saving spinner, share
 *                      button, status pill).
 *   - `history`      : `ShareHistoryPanel` configured against whichever
 *                      activity endpoint applies.
 *   - `footer`       : action row at the bottom; absent if there's
 *                      nothing actionable for the current row state.
 *   - `children`     : details-tab body, a stack of `<Section>` blocks.
 *
 * Locked-in styles, do not parameterize without a reason: the dialog
 * sits at `2xl` width, the body at `max-h-[80vh] min-h-[640px]` so
 * flipping Details ↔ History never shrinks the card. Header padding is
 * `pl-6 pr-14` to keep the title clear of the close button on the right.
 */

export type DetailTab = 'details' | 'calendar' | 'media' | 'history';

const DEFAULT_TABS = [
  { slug: 'details', label: 'Details' },
  { slug: 'media', label: 'Media' },
  { slug: 'history', label: 'History' },
] as const;

const TAB_LABELS: Record<DetailTab, string> = {
  details: 'Details',
  calendar: 'Calendar',
  media: 'Media',
  history: 'History',
};

function buildTabs(
  slugs: ReadonlyArray<DetailTab>,
): ReadonlyArray<{ slug: DetailTab; label: string }> {
  return slugs.map((slug) => ({ slug, label: TAB_LABELS[slug] }));
}

export function ContentDetailDialog({
  open,
  onClose,
  logoUrl,
  brandName,
  brandLabel,
  title,
  headerExtras,
  tab,
  onTabChange,
  tabsAriaLabel,
  tabs,
  history,
  media,
  calendar,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  logoUrl: string | null | undefined;
  /** Falls back to "Client" if `brandLabel` itself is unavailable; used
   *  for the avatar's alt text. */
  brandName: string;
  /** Small text above the title (e.g. brand display name). */
  brandLabel: string;
  /** Rendered as the main title element — caller passes a `<p>` for
   *  static rows, an `<input>` for editable rows. */
  title: ReactNode;
  /** Right-rail header content. Wrapper handles the gap; pass `null` to
   *  skip. */
  headerExtras?: ReactNode;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  tabsAriaLabel: string;
  /** Override the default tab order. Defaults to details/media/history.
   *  Calendar share-link rows pass details/calendar/media/history. */
  tabs?: ReadonlyArray<DetailTab>;
  /** Body content for the History tab. */
  history: ReactNode;
  /** Body content for the Media tab. Pass `null` if the tab isn't
   *  applicable for this row. */
  media?: ReactNode;
  /** Body content for the Calendar tab. Only shown when `tabs` includes
   *  `'calendar'`. */
  calendar?: ReactNode;
  /** Footer slot. The chassis adds the bordered/padded wrapper when this
   *  is truthy; pass `null` to omit the footer entirely. */
  footer?: ReactNode;
  /** Body content for the Details tab. */
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] min-h-[640px] flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-nativz-border py-4 pl-6 pr-14">
          <ClientLogo src={logoUrl} name={brandName} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">{brandLabel}</p>
            {title}
          </div>
          {headerExtras ? (
            <div className="flex items-center gap-2">{headerExtras}</div>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3">
          <SubNav
            ariaLabel={tabsAriaLabel}
            items={tabs ? buildTabs(tabs) : DEFAULT_TABS}
            active={tab}
            onChange={onTabChange}
          />
        </div>

        {/* Body */}
        {tab === 'history' ? (
          <div className="flex-1 overflow-y-auto p-6">{history}</div>
        ) : tab === 'media' ? (
          <div className="flex-1 space-y-5 overflow-y-auto p-6">{media}</div>
        ) : tab === 'calendar' ? (
          <div className="flex-1 overflow-y-auto p-6">{calendar}</div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto p-6">{children}</div>
        )}

        {/* Footer */}
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-nativz-border px-6 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
