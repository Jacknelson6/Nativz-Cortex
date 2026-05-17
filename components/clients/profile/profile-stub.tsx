import type { LucideIcon } from 'lucide-react';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

/**
 * Temporary stub used while the rail-navigated profile pages are being
 * built out one at a time. Renders the page header in the new chrome so
 * the rail nav is fully clickable in dev before the real editors land.
 */
export function ProfileStub({
  icon,
  title,
  subtitle,
  note,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  note?: string;
}) {
  return (
    <>
      <SettingsPageHeader icon={icon} title={title} subtitle={subtitle} />
      <section className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center">
        <p className="text-sm text-text-secondary">
          This surface is part of the brand profile revamp and hasn&apos;t been wired up yet.
        </p>
        {note && (
          <p className="text-xs text-text-muted mt-2 max-w-md mx-auto leading-relaxed">
            {note}
          </p>
        )}
      </section>
    </>
  );
}
