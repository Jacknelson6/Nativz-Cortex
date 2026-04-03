'use client';

import { useState } from 'react';
import { ChevronDown, Lock, Globe, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import type { ApiEndpoint } from '../api-docs-data';

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10',
  POST: 'text-blue-400 bg-blue-500/10',
  PATCH: 'text-amber-400 bg-amber-500/10',
  PUT: 'text-accent2-text bg-accent2-surface',
  DELETE: 'text-red-400 bg-red-500/10',
};

function AuthIcon({ auth }: { auth: string }) {
  if (auth.startsWith('Public')) return <Globe size={12} className="text-emerald-400" />;
  if (auth.includes('API key')) return <Zap size={12} className="text-amber-400" />;
  if (auth.includes('Cron')) return <Zap size={12} className="text-accent2-text" />;
  return <Lock size={12} className="text-text-muted" />;
}

interface SectionEndpointsProps {
  endpoints: ApiEndpoint[];
}

export default function SectionEndpoints({ endpoints }: SectionEndpointsProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="divide-y divide-nativz-border">
        {endpoints.map((ep, i) => {
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
                  className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold font-mono w-16 shrink-0 ${
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
  );
}
