'use client';

import { useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';

/**
 * Renders an iframe of the live preview HTML for a notification, with a brand
 * toggle so admins can compare Nativz vs Anderson Collaborative side-by-side.
 */
export function NotificationPreviewModal({
  notificationKey,
  notificationLabel,
  onClose,
}: {
  notificationKey: string;
  notificationLabel: string;
  onClose: () => void;
}) {
  const [brand, setBrand] = useState<'nativz' | 'anderson'>('nativz');
  // Cache-buster scoped to one mount so the iframe doesn't reuse a stale render
  // when the modal is reopened. Recomputing per render would violate hook purity.
  const cacheBust = useMemo(() => Date.now(), []);
  const src = `/api/admin/notifications/${notificationKey}/preview?brand=${brand}&v=${cacheBust}`;

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={`Preview · ${notificationLabel}`}
      maxWidth="5xl"
      bodyClassName="p-0"
    >
      <div className="flex items-center justify-between border-b border-nativz-border px-4 py-2.5">
        <div className="text-xs text-text-muted">Rendered with sample data — no email is sent.</div>
        <div className="inline-flex rounded-md border border-nativz-border bg-background p-0.5">
          {(['nativz', 'anderson'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrand(b)}
              className={`px-3 py-1 text-xs rounded ${
                brand === b
                  ? 'bg-accent-surface text-accent-text'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {b === 'nativz' ? 'Nativz' : 'Anderson Collaborative'}
            </button>
          ))}
        </div>
      </div>
      <iframe
        title={`${notificationLabel} preview (${brand})`}
        src={src}
        className="block h-[70vh] w-full bg-white"
      />
    </Dialog>
  );
}
