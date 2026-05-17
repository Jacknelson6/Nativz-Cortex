import { ProfileRail, ProfileMobileRail } from '@/components/clients/profile/profile-rail';

/**
 * /admin/clients/[slug]/profile/* — Mobbin-style left-rail brand profile.
 * Replaces the mega-scroll /settings/info and the 8 overlapping sibling
 * settings pages with a single nested rail. Each rail item is one focused
 * subpage; deep nesting lives inside the page via tabs / accordions.
 */
export default async function ClientProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="-mt-6 -mx-5 lg:-mx-8 flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-nativz-border bg-background/40 px-3 py-6">
        <div className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Brand profile
        </div>
        <ProfileRail slug={slug} />
      </aside>

      <div className="min-w-0 flex-1 px-5 lg:px-8 py-6">
        <ProfileMobileRail slug={slug} />
        <div className="max-w-3xl mx-auto pt-6 lg:pt-0 space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
