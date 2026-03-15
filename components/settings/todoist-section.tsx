'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Check, CheckSquare, Eye, EyeOff, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TodoistProject {
  id: string;
  name: string;
}

export function TodoistSection({
  connected,
  projectId,
  syncedAt,
  onConnectionChange,
  onSyncComplete,
}: {
  connected: boolean;
  projectId: string | null;
  syncedAt: string | null;
  onConnectionChange: (connected: boolean) => void;
  onSyncComplete: (syncedAt: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [projects, setProjects] = useState<TodoistProject[]>([]);
  const [selectedProject, setSelectedProject] = useState(projectId ?? '');
  const [savingProject, setSavingProject] = useState(false);

  useEffect(() => {
    if (!connected) return;
    async function load() {
      try {
        const res = await fetch('/api/todoist/connect');
        if (!res.ok) return;
        const data = await res.json();
        if (data.projects) setProjects(data.projects);
        if (data.project_id) setSelectedProject(data.project_id);
      } catch {
        // silent
      }
    }
    load();
  }, [connected]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error('Enter your Todoist API key.');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch('/api/todoist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to connect.');
        return;
      }
      toast.success('Todoist connected');
      if (data.projects) setProjects(data.projects);
      onConnectionChange(true);
      setApiKey('');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/todoist/connect', { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to disconnect.');
        return;
      }
      toast.success('Todoist disconnected');
      onConnectionChange(false);
      setProjects([]);
      setSelectedProject('');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/todoist/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Sync failed.');
        return;
      }
      const { pulled, pushed, errors } = data;
      if (errors?.length) {
        toast.error(`Sync had ${errors.length} error(s). ${pulled} pulled, ${pushed} pushed.`);
      } else {
        toast.success(`Synced: ${pulled} pulled, ${pushed} pushed`);
      }
      onSyncComplete(new Date().toISOString());
    } catch {
      toast.error('Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleProjectChange(pid: string) {
    setSelectedProject(pid);
    setSavingProject(true);
    try {
      await fetch('/api/todoist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: '_keep', project_id: pid || null }),
      });
    } catch {
      // silent
    } finally {
      setSavingProject(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
          <Image src="/icons/todoist.svg" alt="Todoist" width={22} height={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Todoist</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                <Check size={10} />
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {connected
              ? syncedAt
                ? `Two-way task sync · Last synced ${new Date(syncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'Two-way task sync · Not yet synced'
              : 'Sync tasks between Cortex and Todoist'}
          </p>
        </div>

        {connected && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-text-muted hover:text-red-400"
            >
              {disconnecting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Unlink size={12} />
              )}
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {connected && projects.length > 0 && (
        <div className="mt-4 pt-4 border-t border-nativz-border">
          <label className="text-xs text-text-muted block mb-1.5">Sync project</label>
          <select
            value={selectedProject}
            onChange={(e) => handleProjectChange(e.target.value)}
            disabled={savingProject}
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All projects (inbox)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-text-muted mt-1">Only sync tasks from this Todoist project</p>
        </div>
      )}

      {!connected && (
        <form onSubmit={handleConnect} className="mt-4 pt-4 border-t border-nativz-border">
          <label className="text-xs text-text-muted block mb-1.5">
            API key from{' '}
            <a
              href="https://app.todoist.com/app/settings/integrations/developer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text hover:underline"
            >
              Todoist settings
            </a>
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                id="todoist_api_key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key..."
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary p-0.5"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button type="submit" size="sm" disabled={connecting || !apiKey.trim()}>
              {connecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckSquare size={14} />
              )}
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
