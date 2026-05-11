// SPY-09 T14: single bold callout. One headline, one paragraph. Empty
// space is the point — this is the panel the rep lingers on.

interface Props {
  opportunity: { title: string; body: string };
}

export function PanelBiggestOpportunity({ opportunity }: Props) {
  return (
    <div className="flex h-full flex-col justify-center px-12">
      <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
        Biggest opportunity
      </div>
      <h2 className="mt-6 max-w-5xl text-[64px] font-semibold leading-[1.05] text-white">
        {opportunity.title}
      </h2>
      <p className="mt-10 max-w-4xl text-2xl leading-relaxed text-zinc-300">
        {opportunity.body}
      </p>
    </div>
  );
}
