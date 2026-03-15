'use client';

import { useState, useEffect } from 'react';
import { Check, Copy, KeyRound, Loader2, Trash2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ApiKeyData {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
  plaintext?: string;
}

const ALL_SCOPES = ['tasks', 'clients', 'shoots', 'scheduler', 'search', 'team'] as const;

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch('/api/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newKeyName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (newKeyScopes.length === 0) {
      toast.error('Select at least one scope');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create key');
        return;
      }
      setCreatedKey(data.key.plaintext);
      setKeys((prev) => [data.key, ...prev]);
      setShowCreate(false);
      setNewKeyName('');
      setNewKeyScopes([]);
      toast.success('API key created');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to revoke key');
        return;
      }
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, is_active: false } : k)));
      toast.success('API key revoked');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleDelete(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}?permanent=true`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to delete key');
        return;
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success('API key deleted');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRevokingId(null);
    }
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <Card><p className="text-sm text-text-muted py-4 text-center">Loading...</p></Card>;
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-text-muted">
              API keys allow external agents and scripts to access Cortex data.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <KeyRound size={14} />
            Create key
          </Button>
        </div>

        {keys.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">No API keys yet</p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center gap-3 rounded-lg border border-nativz-border p-3 ${!key.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{key.name}</span>
                    {!key.is_active && (
                      <span className="text-[10px] text-red-400 font-medium">Revoked</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted font-mono mt-0.5">{key.key_prefix}...</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {key.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-text"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted/60 mt-1">
                    Created {new Date(key.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {key.last_used_at && (
                      <> · Last used {new Date(key.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                    )}
                  </p>
                </div>
                {key.is_active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(key.id)}
                    disabled={revokingId === key.id}
                    className="text-text-muted hover:text-red-400 shrink-0"
                  >
                    {revokingId === key.id ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                    Revoke
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(key.id)}
                    disabled={revokingId === key.id}
                    className="text-text-muted hover:text-red-400 shrink-0"
                  >
                    {revokingId === key.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create key dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-nativz-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-text-primary mb-4">Create API key</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Claude agent, n8n workflow"
                  className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-2">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SCOPES.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        newKeyScopes.includes(scope)
                          ? 'bg-accent/15 border-accent/30 text-accent-text'
                          : 'bg-transparent border-nativz-border text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {creating ? 'Creating...' : 'Create key'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Created key display */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-nativz-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-text-primary mb-2">Your API key</h3>
            <p className="text-xs text-amber-400 mb-4">
              Copy this key now — you won&apos;t be able to see it again.
            </p>
            <code className="block rounded-lg bg-background border border-nativz-border px-3 py-2.5 text-sm text-text-primary font-mono break-all select-all">
              {createdKey}
            </code>
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" onClick={copyKey} variant="outline">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" onClick={() => setCreatedKey(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
