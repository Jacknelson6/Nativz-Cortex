export function CompetitorIntelligenceHero() {
  return (
    <header className="relative space-y-4 pt-6">
      <p
        className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300/90 animate-ci-rise"
        style={{ animationDelay: '0ms', fontStyle: 'italic', fontFamily: 'Rubik, system-ui, sans-serif' }}
      >
        Competitor intelligence
      </p>
      <h1
        className="animate-ci-rise text-[40px] font-bold leading-[1.05] tracking-tight text-text-primary sm:text-5xl lg:text-[56px]"
        style={{ animationDelay: '60ms', fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
      >
        See what the <u className="nz-u">competition</u> is posting — and when it changes.
      </h1>
      <p
        className="animate-ci-rise max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg"
        style={{ animationDelay: '120ms', fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
      >
        Run a deep audit of any brand&apos;s short-form presence, or enrol competitors into an ongoing
        benchmark. Cortex watches, captures deltas, and sends the report.
      </p>
    </header>
  );
}
