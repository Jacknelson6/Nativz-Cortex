import Link from 'next/link';
import { headers } from 'next/headers';
import { Key, ArrowRight, Copy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/tasks', scope: 'tasks', description: 'List tasks (filter by status, client_id, assignee_id, due_date_from, due_date_to)' },
  { method: 'POST', path: '/api/v1/tasks', scope: 'tasks', description: 'Create a new task' },
  { method: 'GET', path: '/api/v1/tasks/:id', scope: 'tasks', description: 'Get a single task' },
  { method: 'PATCH', path: '/api/v1/tasks/:id', scope: 'tasks', description: 'Update a task' },
  { method: 'DELETE', path: '/api/v1/tasks/:id', scope: 'tasks', description: 'Archive a task' },
  { method: 'GET', path: '/api/v1/clients', scope: 'clients', description: 'List all clients' },
  { method: 'GET', path: '/api/v1/clients/:id', scope: 'clients', description: 'Get client details with contacts' },
  { method: 'POST', path: '/api/v1/clients', scope: 'clients', description: 'Onboard a new client' },
  { method: 'GET', path: '/api/v1/shoots', scope: 'shoots', description: 'List shoots (filter by client_id, status, date range)' },
  { method: 'GET', path: '/api/v1/shoots/:id', scope: 'shoots', description: 'Get a single shoot' },
  { method: 'GET', path: '/api/v1/posts', scope: 'scheduler', description: 'List scheduled posts (requires client_id)' },
  { method: 'POST', path: '/api/v1/posts', scope: 'scheduler', description: 'Create a scheduled post' },
  { method: 'GET', path: '/api/v1/posts/:id', scope: 'scheduler', description: 'Get a single post with platforms and media' },
  { method: 'POST', path: '/api/v1/search', scope: 'search', description: 'Trigger AI topic search for a client' },
  { method: 'GET', path: '/api/v1/team', scope: 'team', description: 'List active team members' },
  { method: 'POST', path: '/api/v1/team', scope: 'team', description: 'Create a team member' },
  { method: 'GET', path: '/api/v1/clients/:id/knowledge', scope: 'knowledge', description: 'List knowledge entries for a client' },
  { method: 'POST', path: '/api/v1/clients/:id/knowledge', scope: 'knowledge', description: 'Create a knowledge entry' },
  { method: 'GET', path: '/api/v1/clients/:id/knowledge/:entryId', scope: 'knowledge', description: 'Get a single knowledge entry' },
  { method: 'GET', path: '/api/v1/clients/:id/knowledge/graph', scope: 'knowledge', description: 'Get knowledge graph data (entries + links)' },
] as const;

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10',
  POST: 'text-blue-400 bg-blue-500/10',
  PATCH: 'text-amber-400 bg-amber-500/10',
  DELETE: 'text-red-400 bg-red-500/10',
};

export default async function ApiDocsPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  // Group by scope
  const scopes = [...new Set(ENDPOINTS.map((e) => e.scope))];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Key size={22} className="text-blue-400" />
          API reference
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Use bearer token authentication to access Cortex data from external agents and scripts.
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
{`curl -H "Authorization: Bearer ntvz_xxx" \\
  ${baseUrl}/api/v1/tasks`}
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
          100 requests per minute per API key. Exceeding this limit returns a <code className="text-text-secondary">429</code> status.
        </p>
      </Card>

      {/* Scopes */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Scopes</h2>
        <p className="text-xs text-text-muted mb-3">
          Each API key has one or more scopes that control which endpoints it can access.
        </p>
        <div className="flex flex-wrap gap-2">
          {scopes.map((scope) => (
            <Badge key={scope} variant="info">{scope}</Badge>
          ))}
        </div>
      </Card>

      {/* Endpoints grouped by scope */}
      {scopes.map((scope) => {
        const endpoints = ENDPOINTS.filter((e) => e.scope === scope);
        return (
          <div key={scope}>
            <h2 className="text-sm font-semibold text-text-primary mb-3 capitalize flex items-center gap-2">
              <Badge variant="info">{scope}</Badge>
              endpoints
            </h2>
            <Card className="overflow-hidden !p-0">
              <div className="divide-y divide-nativz-border">
                {endpoints.map((endpoint, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold font-mono ${METHOD_COLORS[endpoint.method] ?? ''}`}>
                      {endpoint.method}
                    </span>
                    <code className="text-sm text-text-primary font-mono flex-shrink-0">
                      {endpoint.path}
                    </code>
                    <span className="text-xs text-text-muted truncate">
                      {endpoint.description}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })}

      {/* Error responses */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Error responses</h2>
        <div className="space-y-2 text-xs text-text-muted">
          <div className="flex gap-3">
            <code className="text-text-secondary font-mono w-8 shrink-0">401</code>
            <span>Missing or invalid API key</span>
          </div>
          <div className="flex gap-3">
            <code className="text-text-secondary font-mono w-8 shrink-0">403</code>
            <span>API key lacks the required scope</span>
          </div>
          <div className="flex gap-3">
            <code className="text-text-secondary font-mono w-8 shrink-0">404</code>
            <span>Resource not found</span>
          </div>
          <div className="flex gap-3">
            <code className="text-text-secondary font-mono w-8 shrink-0">429</code>
            <span>Rate limit exceeded (100 req/min)</span>
          </div>
          <div className="flex gap-3">
            <code className="text-text-secondary font-mono w-8 shrink-0">500</code>
            <span>Internal server error</span>
          </div>
        </div>
      </Card>

      <div className="h-20" />
    </div>
  );
}
