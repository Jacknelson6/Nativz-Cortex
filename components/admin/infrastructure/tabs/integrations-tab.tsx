import { Stat, HealthDot } from '../stat';

interface Integration {
  slug: string;
  name: string;
  role: string;
  docs: string;
  envChecks: string[];
}

const INTEGRATIONS: Integration[] = [
  {
    slug: 'supabase',
    name: 'Supabase',
    role: 'Postgres, auth, storage, RLS. Core data plane.',
    docs: 'https://supabase.com/docs',
    envChecks: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    slug: 'openrouter',
    name: 'OpenRouter',
    role: 'Unified LLM gateway (OpenAI / Anthropic / Gemini / Perplexity).',
    docs: 'https://openrouter.ai/docs',
    envChecks: ['OPENROUTER_API_KEY'],
  },
  {
    slug: 'gemini',
    name: 'Google AI (Gemini)',
    role: 'Video analysis + embeddings. Direct SDK path.',
    docs: 'https://ai.google.dev',
    envChecks: ['GOOGLE_AI_API_KEY'],
  },
  {
    slug: 'zernio',
    name: 'Zernio',
    role: 'Social posting + analytics. Successor to Late.',
    docs: 'https://docs.zernio.com',
    envChecks: ['ZERNIO_API_KEY'],
  },
  {
    slug: 'nango',
    name: 'Nango',
    role: 'OAuth broker for Google Calendar.',
    docs: 'https://docs.nango.dev',
    envChecks: ['NANGO_SECRET_KEY'],
  },
  {
    slug: 'resend',
    name: 'Resend',
    role: 'Transactional + branded reporting email.',
    docs: 'https://resend.com/docs',
    envChecks: ['RESEND_API_KEY'],
  },
  {
    slug: 'apify',
    name: 'Apify',
    role: 'TikTok / IG / Facebook / YouTube scraping actors.',
    docs: 'https://docs.apify.com',
    envChecks: ['APIFY_API_TOKEN'],
  },
  {
    slug: 'searxng',
    name: 'SearXNG',
    role: 'Self-hosted SERP provider (topic search).',
    docs: 'https://docs.searxng.org',
    envChecks: ['SEARXNG_URL'],
  },
  {
    slug: 'reclip',
    name: 'ReClip',
    role: 'Video downloader. Mac mini only.',
    docs: '',
    envChecks: ['RECLIP_BASE_URL'],
  },
  {
    slug: 'github',
    name: 'GitHub',
    role: 'Obsidian vault sync.',
    docs: 'https://docs.github.com/rest',
    envChecks: ['GITHUB_TOKEN', 'OBSIDIAN_REPO'],
  },
  {
    slug: 'linear',
    name: 'Linear',
    role: 'Project tracking (MCP + server-side fallback).',
    docs: 'https://developers.linear.app',
    envChecks: ['LINEAR_API_KEY'],
  },
];

function envConfigured(keys: string[]): { state: 'healthy' | 'degraded' | 'unknown'; missing: string[] } {
  const missing: string[] = [];
  for (const key of keys) {
    if (!process.env[key] || process.env[key] === '') missing.push(key);
  }
  if (missing.length === 0) return { state: 'healthy', missing };
  if (missing.length < keys.length) return { state: 'degraded', missing };
  return { state: 'unknown', missing };
}

export function IntegrationsTab() {
  const configured = INTEGRATIONS.map((integration) => ({
    ...integration,
    health: envConfigured(integration.envChecks),
  }));

  const fullyConfigured = configured.filter((i) => i.health.state === 'healthy').length;
  const partial = configured.filter((i) => i.health.state === 'degraded').length;
  const notConfigured = configured.filter((i) => i.health.state === 'unknown').length;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Integrations" value={String(INTEGRATIONS.length)} />
        <Stat label="Fully configured" value={String(fullyConfigured)} />
        <Stat label="Partial" value={String(partial)} />
        <Stat label="Not configured" value={String(notConfigured)} />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {configured.map((i) => (
          <div
            key={i.slug}
            className="rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:border-nativz-border/90"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{i.name}</h3>
                <p className="mt-0.5 text-xs text-text-muted">{i.role}</p>
              </div>
              <HealthDot
                state={i.health.state}
                label={
                  i.health.state === 'healthy'
                    ? 'Configured'
                    : i.health.state === 'degraded'
                      ? 'Partial'
                      : 'Not configured'
                }
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
              {i.envChecks.map((env) => {
                const isSet = !i.health.missing.includes(env);
                return (
                  <span
                    key={env}
                    className={
                      'rounded border px-1.5 py-0.5 ' +
                      (isSet
                        ? 'border-accent/30 bg-accent/10 text-accent-text'
                        : 'border-coral-500/30 bg-coral-500/10 text-coral-300')
                    }
                  >
                    {env}
                  </span>
                );
              })}
            </div>
            {i.docs && (
              <a
                href={i.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[11px] text-accent-text underline decoration-dotted"
              >
                Docs →
              </a>
            )}
          </div>
        ))}
      </section>

      <p className="text-[11px] text-text-muted">
        Health state reflects environment-variable configuration only. A green dot means every referenced
        env var is set — it does not guarantee the remote service is reachable. Live pings are future
        work; for now the Crons tab is the best proxy for real-world behaviour.
      </p>
    </div>
  );
}
