import { TableLoading } from '@/components/shared/page-loading';

/**
 * Loading shell for /admin/sales. Mirrors the live page layout —
 * header + headline metric strip + filter chips + table — so the
 * paint-to-paint transition is seamless.
 */
export default function Loading() {
  return <TableLoading />;
}
