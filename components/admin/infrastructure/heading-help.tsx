import { HelpCircle } from 'lucide-react';
import { TooltipCard } from '@/components/ui/tooltip-card';

/**
 * The `?` icon used next to section headings in the Usage page tabs.
 * Replaces the explanatory `<p>` subtext with a hover-revealed tooltip card,
 * matching the pattern used by SectionPanel.helpText on the Settings page.
 */
export function HeadingHelp({ title, description }: { title: string; description: string }) {
  return (
    <TooltipCard title={title} description={description} iconTrigger>
      <button
        type="button"
        aria-label={`Learn more about ${title}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-secondary cursor-help"
      >
        <HelpCircle size={13} />
      </button>
    </TooltipCard>
  );
}
