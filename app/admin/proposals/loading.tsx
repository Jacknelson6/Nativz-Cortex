import PageLoading from '@/components/shared/page-loading';

/**
 * Covers /admin/proposals + all descendants (/[slug], /new, /builder,
 * /services, /draft/[id]/preview). The flat list is now a redirect to
 * /admin/sales, but children still mount under this segment when
 * navigated directly.
 */
export default function Loading() {
  return <PageLoading />;
}
