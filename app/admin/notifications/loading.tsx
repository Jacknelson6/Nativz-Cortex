import { TabbedPageSkeleton } from '@/components/admin/shared/tabbed-page-skeleton';

export default function Loading() {
  return <TabbedPageSkeleton tileCount={0} tabCount={5} />;
}
