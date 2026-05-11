// VFF-07 T11: muted banner when analyzed library is below seeding threshold.

import { Sparkles } from 'lucide-react';

export function SeedingBanner() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-surface/60 px-4 py-3 text-xs text-white/70">
      <Sparkles size={14} className="shrink-0 text-accent" />
      <p>
        Seeding your library, check back in 24 hours. These rows are mixed with
        global top picks for now.
      </p>
    </div>
  );
}
