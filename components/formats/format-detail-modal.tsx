'use client';

// VFF-09 T14: modal wrapper around FormatDetailPane.
// Used by the intercepting parallel route at @modal/(.)formats/[id].
// Closing the modal routes back; if there's no history (e.g. user
// landed directly on the modal URL), we push /admin/formats.

import { useRouter } from 'next/navigation';
import type { FormatDetailPayload } from '@/lib/analytics/format-detail';
import { Dialog } from '@/components/ui/dialog';
import { FormatDetailPane } from './format-detail-pane';

type Props = {
  data: FormatDetailPayload;
  brand_name?: string | null;
};

export function FormatDetailModal({ data, brand_name = null }: Props) {
  const router = useRouter();

  function close() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/admin/formats');
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      maxWidth="full"
      bodyClassName="p-6 overflow-y-auto max-h-[calc(100vh-4rem)]"
    >
      <FormatDetailPane data={data} brand_name={brand_name} />
    </Dialog>
  );
}
