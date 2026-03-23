import { headers } from 'next/headers';
import Link from 'next/link';
import {
  Key, ArrowRight, Shield, Search, Building2, Layers, Brain, Lightbulb, Video,
  CheckSquare, GitBranch, Camera, Microscope, Bot, Calendar, BarChart3,
  Globe, Users, Bell, Database, LayoutDashboard, UserPlus, Settings,
  Workflow, ListTodo, Plug, Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { API_SECTIONS, API_ENDPOINTS } from './api-docs-data';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Shield, Key, Search, Building2, Layers, Brain, Lightbulb, Video,
  CheckSquare, GitBranch, Camera, Microscope, Bot, Calendar, BarChart3,
  Globe, Users, Bell, Database, LayoutDashboard, UserPlus, Settings,
  Workflow, ListTodo, Plug, Clock,
};

function getSectionCounts() {
  const counts = new Map<string, number>();
  for (const ep of API_ENDPOINTS) {
    counts.set(ep.sectionSlug, (counts.get(ep.sectionSlug) ?? 0) + 1);
  }
  return counts;
}

export default async function ApiDocsPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const sectionCounts = getSectionCounts();

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <div>
        <h1 className="ui-page-title flex items-center gap-2">
          <Key size={22} className="text-blue-400" />
          API reference
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Complete documentation for all {API_ENDPOINTS.length} Cortex API endpoints across {API_SECTIONS.length} sections.
        </p>
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

      {/* Sections grid */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-4">Sections</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {API_SECTIONS.map((section) => {
            const Icon = ICON_MAP[section.icon];
            const count = sectionCounts.get(section.slug) ?? 0;

            return (
              <Link
                key={section.slug}
                href={`/admin/nerd/api/${section.slug}`}
                className="group"
              >
                <Card className="h-full transition-colors group-hover:border-accent/30">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-white/[0.04] p-2 shrink-0">
                      {Icon && <Icon size={16} className="text-text-muted group-hover:text-accent-text transition-colors" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-text-primary group-hover:text-accent-text transition-colors">
                          {section.title}
                        </h3>
                        <Badge variant="info">{count}</Badge>
                      </div>
                      <p className="text-xs text-text-muted line-clamp-2">{section.description}</p>
                    </div>
                    <ArrowRight size={14} className="text-text-muted/30 group-hover:text-accent-text shrink-0 mt-1 transition-colors" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

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
