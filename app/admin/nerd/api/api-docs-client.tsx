'use client';

import { useState, useMemo, useRef } from 'react';
import { Key, Search, ArrowRight, ChevronDown, Lock, Globe, Zap } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ApiEndpoint } from './api-docs-data';

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10',
  POST: 'text-blue-400 bg-blue-500/10',
  PATCH: 'text-amber-400 bg-amber-500/10',
  PUT: 'text-purple-400 bg-purple-500/10',
  DELETE: 'text-red-400 bg-red-500/10',
};

function AuthIcon({ auth }: { auth: string }) {
  if (auth.startsWith('Public')) return <Globe size={12} className="text-emerald-400" />;
  if (auth.includes('API key')) return <Zap size={12} className="text-amber-400" />;
  if (auth.includes('Cron')) return <Zap size={12} className="text-purple-400" />;
  return <Lock size={12} className="text-text-muted" />;
}

interface ApiDocsClientProps {
  endpoints: ApiEndpoint[];
  sections: readonly string[];
  baseUrl: string;
}

export default function ApiDocsClient({ endpoints, sections, baseUrl }: ApiDocsClientProps) {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return endpoints.filter((ep) => {
      const matchesSearch =
        !q ||
        ep.path.toLowerCase().includes(q) ||
        ep.description.toLowerCase().includes(q) ||
        ep.section.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q);
      const matchesSection = !activeSection || ep.section === activeSection;
      return matchesSearch && matchesSection;
    });
  }, [search, activeSection, endpoints]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    for (const ep of filtered) {
      const list = map.get(ep.section) ?? [];
      list.push(ep);
      map.set(ep.section, list);
    }
    // Sort by the canonical section order
    const ordered: [string, ApiEndpoint[]][] = [];
    for (const s of sections) {
      const list = map.get(s);
      if (list) ordered.push([s, list]);
    }
    return ordered;
  }, [filtered, sections]);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ep of endpoints) {
      counts.set(ep.section, (counts.get(ep.section) ?? 0) + 1);
    }
    return counts;
  }, [endpoints]);

  const toggleExpand = (key: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Key size={22} className="text-blue-400" />
          API reference
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Complete API documentation for Cortex endpoints
        </p>

        {/* Search */}
        <div className="relative mt-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints by path, description, or section..."
            className="w-full bg-surface border border-nativz-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
          />
          {search && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Section pills */}
        <div ref={scrollRef} className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveSection(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !activeSection
                ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                : 'bg-white/[0.06] text-text-muted hover:text-text-secondary hover:bg-white/[0.1]'
            }`}
          >
            All ({endpoints.length})
          </button>
          {sections.map((s) => {
            const count = sectionCounts.get(s) ?? 0;
            return (
              <button
                key={s}
                onClick={() => setActiveSection(activeSection === s ? null : s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeSection === s
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                    : 'bg-white/[0.06] text-text-muted hover:text-text-secondary hover:bg-white/[0.1]'
                }`}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Getting started */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Getting started</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-text-muted mb-1">Base URL</p>
            <code className="block rounded-lg bg-background border border-nativz-border px-3 py-2 text-sm text-text-primary font-mono">
              {baseUrl}
            </code>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Authentication</p>
            <code className="block rounded-lg bg-background border border-nativz-border px-3 py-2 text-sm text-text-primary font-mono">
              Authorization: Bearer ntvz_your_key_here
            </code>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Example request</p>
            <code className="block rounded-lg bg-background border border-nativz-border px-3 py-2 text-sm text-text-primary font-mono whitespace-pre-wrap">
              {`curl -H "Authorization: Bearer ntvz_xxx" \\\n  ${baseUrl}/api/v1/tasks`}
            </code>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:underline"
            >
              <Key size={12} />
              Manage API keys in Settings
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </Card>

      {/* Endpoint sections */}
      {grouped.map(([section, eps]) => (
        <div key={section}>
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            {section}
            <Badge variant="info">{eps.length}</Badge>
          </h2>
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-nativz-border">
              {eps.map((ep, i) => {
                const key = `${ep.method}-${ep.path}-${i}`;
                const isExpanded = expandedPaths.has(key);
                const hasDetails = ep.body || ep.query || ep.response || ep.useWhen;
                return (
                  <div key={key}>
                    <button
                      onClick={() => hasDetails && toggleExpand(key)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        hasDetails ? 'hover:bg-white/[0.02] cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold font-mono w-16 shrink-0 ${
                          METHOD_COLORS[ep.method] ?? ''
                        }`}
                      >
                        {ep.method}
                      </span>
                      <code className="text-sm text-text-primary font-mono shrink-0">
                        {ep.path}
                      </code>
                      <span className="text-xs text-text-muted truncate flex-1 ml-1">
                        {ep.description}
                      </span>
                      {hasDetails && (
                        <ChevronDown
                          size={14}
                          className={`text-text-muted shrink-0 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </button>
                    <AnimatePresence>
                      {isExpanded && hasDetails && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-1 ml-[76px] space-y-2.5">
                            <div className="flex items-center gap-2 text-xs">
                              <AuthIcon auth={ep.auth} />
                              <span className="text-text-muted">{ep.auth}</span>
                            </div>
                            {ep.query && (
                              <div>
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                                  Query params
                                </p>
                                <code className="block text-xs text-text-secondary bg-background border border-nativz-border rounded-md px-3 py-2 font-mono whitespace-pre-wrap">
                                  {ep.query}
                                </code>
                              </div>
                            )}
                            {ep.body && (
                              <div>
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                                  Request body
                                </p>
                                <code className="block text-xs text-text-secondary bg-background border border-nativz-border rounded-md px-3 py-2 font-mono whitespace-pre-wrap">
                                  {ep.body}
                                </code>
                              </div>
                            )}
                            {ep.response && (
                              <div>
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                                  Response
                                </p>
                                <code className="block text-xs text-text-secondary bg-background border border-nativz-border rounded-md px-3 py-2 font-mono whitespace-pre-wrap">
                                  {ep.response}
                                </code>
                              </div>
                            )}
                            {ep.useWhen && (
                              <div className="flex gap-2 items-start pt-1">
                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider shrink-0 mt-0.5">
                                  Use when
                                </span>
                                <span className="text-xs text-text-muted">{ep.useWhen}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ))}

      {/* Rate limiting */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-2">Rate limiting</h2>
        <p className="text-xs text-text-muted">
          API key routes (<code className="text-text-secondary">/api/v1/*</code>) are limited to{' '}
          <strong className="text-text-secondary">100 requests per minute</strong> per API key.
          Exceeding this limit returns a <code className="text-text-secondary">429</code> status
          with a <code className="text-text-secondary">Retry-After</code> header.
        </p>
      </Card>

      {/* Error responses */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Error responses</h2>
        <p className="text-xs text-text-muted mb-3">
          All errors return <code className="text-text-secondary">{'{ error: string }'}</code> with
          the appropriate HTTP status code.
        </p>
        <div className="space-y-2 text-xs text-text-muted">
          {[
            ['200', 'OK'],
            ['201', 'Created'],
            ['400', 'Bad request — invalid or missing parameters'],
            ['401', 'Unauthorized — missing or invalid auth'],
            ['403', 'Forbidden — API key lacks required scope'],
            ['404', 'Not found'],
            ['409', 'Conflict'],
            ['422', 'Unprocessable entity'],
            ['429', 'Rate limit exceeded (100 req/min)'],
            ['500', 'Internal server error'],
            ['503', 'Service unavailable'],
          ].map(([code, desc]) => (
            <div key={code} className="flex gap-3">
              <code className="text-text-secondary font-mono w-8 shrink-0">{code}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Response conventions */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Response conventions</h2>
        <div className="space-y-2 text-xs text-text-muted">
          <p>
            <strong className="text-text-secondary">Dates</strong> — ISO 8601 (
            <code className="text-text-secondary">YYYY-MM-DD</code> for dates, full ISO string for
            timestamps)
          </p>
          <p>
            <strong className="text-text-secondary">Async jobs</strong> — Create record, receive{' '}
            <code className="text-text-secondary">{'{ id, status: "processing" }'}</code>, poll
            status endpoint until{' '}
            <code className="text-text-secondary">completed</code> or{' '}
            <code className="text-text-secondary">failed</code>
          </p>
          <p>
            <strong className="text-text-secondary">SSE streams</strong> —{' '}
            <code className="text-text-secondary">Content-Type: text/event-stream</code>. Parse{' '}
            <code className="text-text-secondary">data: </code> lines; stream ends with{' '}
            <code className="text-text-secondary">data: [DONE]</code>
          </p>
        </div>
      </Card>

      <div className="h-20" />
    </div>
  );
}
