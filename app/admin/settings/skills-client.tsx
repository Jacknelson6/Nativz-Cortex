'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Github,
  FileText,
  Power,
  Pencil,
  X,
  Users as UsersIcon,
  Check,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';

/**
 * Parse a GitHub URL like `https://github.com/owner/repo/blob/branch/path/to/file.md`
 * into { repo: "owner/repo", branch, path }. Returns null if the URL doesn't match.
 * Handles `/blob/`, `/tree/`, raw URLs, and `?ref=` fallback for the branch.
 */
function parseGithubUrl(url: string): { repo: string; branch: string; path: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!/^(www\.)?github\.com$|^raw\.githubusercontent\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo, type, ...rest] = parts;
    if (u.hostname === 'raw.githubusercontent.com') {
      const [branch, ...path] = rest.length ? [type, ...rest] : [];
      if (!branch || path.length === 0) return null;
      return { repo: `${owner}/${repo}`, branch, path: path.join('/') };
    }
    if (type !== 'blob' && type !== 'tree') return null;
    const [branch, ...path] = rest;
    if (!branch || path.length === 0) return null;
    return { repo: `${owner}/${repo}`, branch, path: path.join('/') };
  } catch {
    return null;
  }
}

type Harness = 'admin_nerd' | 'admin_content_lab' | 'portal_content_lab';

const HARNESS_LABELS: Record<Harness, string> = {
  admin_nerd: 'Admin Nerd',
  admin_content_lab: 'Admin Strategy Lab',
  portal_content_lab: 'Portal Strategy Lab',
};

const HARNESS_DESCRIPTIONS: Record<Harness, string> = {
  admin_nerd: 'The admin-wide Nerd chat at /admin/nerd',
  admin_content_lab: 'Admin Strategy Lab for any client',
  portal_content_lab: 'Client-facing Strategy Lab in the portal',
};

interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  keywords: string[];
  is_active: boolean;
  source: 'github' | 'upload';
  harnesses: Harness[];
  client_id: string | null;
  github_repo: string | null;
  github_path: string | null;
  github_branch: string | null;
  command_slug: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

export function AISettingsSkillsClient({ clients }: { clients: ClientOption[] }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/nerd/skills');
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as { skills: Skill[] };
      setSkills(data.skills ?? []);
    } catch {
      toast.error('Could not load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleToggleActive(skill: Skill) {
    try {
      const res = await fetch('/api/nerd/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, is_active: !skill.is_active }),
      });
      if (!res.ok) throw new Error();
      toast.success(skill.is_active ? 'Disabled' : 'Enabled');
      void refresh();
    } catch {
      toast.error('Update failed');
    }
  }

  async function handleSync(skill: Skill) {
    try {
      const res = await fetch('/api/nerd/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, sync: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      toast.success('Synced from GitHub');
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    }
  }

  async function handleDelete(skill: Skill) {
    if (!confirm(`Delete "${skill.name}"? This can't be undone.`)) return;
    try {
      const res = await fetch('/api/nerd/skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id }),
      });
      if (!res.ok) throw new Error();
      toast.success('Deleted');
      void refresh();
    } catch {
      toast.error('Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading skills…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New skill
        </Button>
      </div>

      {skills.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="w-full rounded-xl border border-dashed border-nativz-border bg-surface/40 px-6 py-16 text-center transition-colors hover:border-accent/40 hover:bg-surface/60"
        >
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface/40">
            <Upload size={18} className="text-accent-text" />
          </div>
          <p className="mt-3 text-sm font-medium text-text-primary">No skills yet</p>
          <p className="mt-1 text-xs text-text-muted">
            Drop a markdown file, paste a GitHub link, or write one from scratch.
          </p>
        </button>
      ) : (
        <ul className="space-y-2">
          {skills.map((s) => (
            <li
              key={s.id}
              className={cn(
                'rounded-xl border border-nativz-border bg-surface p-5 transition-colors',
                !s.is_active && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-text-primary truncate">
                      {s.name}
                    </h3>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                        s.source === 'upload'
                          ? 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300'
                          : 'border-nativz-border text-text-muted',
                      )}
                    >
                      {s.source === 'upload' ? <FileText size={12} /> : <Github size={12} />}
                      {s.source}
                    </span>
                    {s.client_id && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-surface/40 px-2.5 py-1 text-xs font-medium text-accent-text">
                        <UsersIcon size={12} />
                        {clientMap.get(s.client_id)?.name ?? 'client-scoped'}
                      </span>
                    )}
                    {s.command_slug && (
                      <span className="inline-flex rounded-full border border-nativz-border px-2.5 py-1 text-xs font-mono text-text-muted">
                        /{s.command_slug}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-2 text-sm text-text-muted line-clamp-2 leading-relaxed">{s.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(['admin_nerd', 'admin_content_lab', 'portal_content_lab'] as Harness[]).map(
                      (h) => {
                        const on = s.harnesses.includes(h);
                        return (
                          <span
                            key={h}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                              on
                                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                                : 'border-nativz-border/50 bg-background/40 text-text-muted/50',
                            )}
                            title={HARNESS_DESCRIPTIONS[h]}
                          >
                            {on && <Check size={12} />}
                            {HARNESS_LABELS[h]}
                          </span>
                        );
                      },
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(s)}
                    title={s.is_active ? 'Disable' : 'Enable'}
                    className={cn(
                      'rounded-md p-2 transition-colors',
                      s.is_active
                        ? 'text-emerald-400 hover:bg-surface-hover'
                        : 'text-text-muted hover:bg-surface-hover hover:text-text-primary',
                    )}
                  >
                    <Power size={16} />
                  </button>
                  {s.source === 'github' && (
                    <button
                      type="button"
                      onClick={() => void handleSync(s)}
                      title="Re-sync from GitHub"
                      className="rounded-md p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingSkill(s)}
                    title="Edit"
                    className="rounded-md p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(s)}
                    title="Delete"
                    className="rounded-md p-2 text-text-muted transition-colors hover:bg-red-500/15 hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <SkillEditor
          clients={clients}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      )}
      {editingSkill && (
        <SkillEditor
          skill={editingSkill}
          clients={clients}
          onClose={() => setEditingSkill(null)}
          onSaved={() => {
            setEditingSkill(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────

function SkillEditor({
  skill,
  clients,
  onClose,
  onSaved,
}: {
  skill?: Skill;
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!skill;
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [content, setContent] = useState(skill?.content ?? '');
  const [commandSlug, setCommandSlug] = useState(skill?.command_slug ?? '');
  const [harnesses, setHarnesses] = useState<Harness[]>(
    skill?.harnesses ?? ['admin_nerd', 'admin_content_lab'],
  );
  const [clientId, setClientId] = useState<string | null>(skill?.client_id ?? null);
  const [githubRepo, setGithubRepo] = useState(skill?.github_repo ?? '');
  const [githubPath, setGithubPath] = useState(skill?.github_path ?? '');
  const [githubBranch, setGithubBranch] = useState(skill?.github_branch ?? 'main');
  const [githubUrl, setGithubUrl] = useState('');
  const [source, setSource] = useState<'upload' | 'github'>(skill?.source ?? 'upload');
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readMarkdownFile = useCallback(async (file: File) => {
    if (!/\.(md|mdx|markdown|txt)$/i.test(file.name)) {
      toast.error('Only markdown files (.md, .mdx, .markdown, .txt)');
      return;
    }
    const text = await file.text();
    setContent(text);
    if (!name.trim()) {
      const base = file.name.replace(/\.(md|mdx|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
      if (base) setName(base);
    }
    toast.success(`Loaded ${file.name}`);
  }, [name]);

  function handleGithubUrlChange(url: string) {
    setGithubUrl(url);
    const parsed = parseGithubUrl(url);
    if (parsed) {
      setGithubRepo(parsed.repo);
      setGithubBranch(parsed.branch);
      setGithubPath(parsed.path);
      if (!name.trim()) {
        const base = parsed.path.split('/').pop()?.replace(/\.(md|mdx|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
        if (base) setName(base);
      }
    }
  }

  function toggleHarness(h: Harness) {
    setHarnesses((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    );
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Name required');
      return;
    }
    if (harnesses.length === 0) {
      toast.error('Pick at least one harness');
      return;
    }
    if (!isEdit && source === 'upload' && !content.trim()) {
      toast.error('Paste the markdown body');
      return;
    }
    if (!isEdit && source === 'github' && (!githubRepo.trim() || !githubPath.trim())) {
      toast.error('GitHub repo + path required');
      return;
    }

    setSaving(true);
    try {
      const method = isEdit ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        harnesses,
        client_id: clientId,
        command_slug: commandSlug.trim() || null,
      };
      if (isEdit) {
        body.id = skill!.id;
        if (skill!.source === 'upload') body.content = content;
      } else if (source === 'upload') {
        body.content = content;
      } else {
        body.github_repo = githubRepo.trim();
        body.github_path = githubPath.trim();
        body.github_branch = githubBranch.trim() || 'main';
      }

      const res = await fetch('/api/nerd/skills', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      toast.success(isEdit ? 'Saved' : 'Created');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Edit · ${skill!.name}` : 'New skill'} maxWidth="2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. short-form script writing"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
          />
        </div>

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Description <span className="text-text-muted font-normal">(short)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary used in slash-command typeahead"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
            />
          </div>
        )}

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Apply to harnesses
            </label>
            <div className="space-y-2">
              {(['admin_nerd', 'admin_content_lab', 'portal_content_lab'] as Harness[]).map((h) => (
                <label key={h} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={harnesses.includes(h)}
                    onChange={() => toggleHarness(h)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm text-text-primary">{HARNESS_LABELS[h]}</p>
                    <p className="text-xs text-text-muted">{HARNESS_DESCRIPTIONS[h]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Scope to a single client <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <select
              value={clientId ?? ''}
              onChange={(e) => setClientId(e.target.value || null)}
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
            >
              <option value="">— Agency-wide (all clients) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted/80">
              When set, the skill only loads when this client is pinned.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            {isEdit ? (
              <>Slash command <span className="text-text-muted font-normal">(optional)</span></>
            ) : (
              <>How to invoke <span className="text-text-muted font-normal">(slash command, optional)</span></>
            )}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-text-muted">/</span>
            <input
              type="text"
              value={commandSlug}
              onChange={(e) => setCommandSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="generate"
              className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
            />
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Source</label>
            <div className="inline-flex rounded-lg border border-nativz-border p-0.5">
              {(['upload', 'github'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    source === s ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary',
                  )}
                >
                  {s === 'upload' ? 'Paste markdown' : 'From GitHub'}
                </button>
              ))}
            </div>
          </div>
        )}

        {(isEdit ? skill!.source === 'upload' : source === 'upload') && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              Markdown body
            </label>
            {!isEdit && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void readMarkdownFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'cursor-pointer rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
                  dragging
                    ? 'border-accent/60 bg-accent-surface/20'
                    : 'border-nativz-border bg-surface/40 hover:border-accent/30 hover:bg-surface/60',
                )}
              >
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent-surface/40">
                  <Upload size={14} className="text-accent-text" />
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">Drop a .md file</span>{' '}
                  or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.mdx,.markdown,.txt,text/markdown,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readMarkdownFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Skill name&#10;&#10;..."
              rows={14}
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
            />
          </div>
        )}

        {!isEdit && source === 'github' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                GitHub URL <span className="text-text-muted font-normal">(paste a blob link)</span>
              </label>
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => handleGithubUrlChange(e.target.value)}
                placeholder="https://github.com/owner/repo/blob/main/skills/example.md"
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
              />
              <p className="mt-1 text-xs text-text-muted/80">
                Pasting a GitHub file URL auto-fills repo, branch, and path below.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Repo</label>
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="Anderson-Collaborative/ac-docs"
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Path</label>
                <input
                  type="text"
                  value={githubPath}
                  onChange={(e) => setGithubPath(e.target.value)}
                  placeholder="skills/content-pillars.md"
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Branch</label>
                <input
                  type="text"
                  value={githubBranch}
                  onChange={(e) => setGithubBranch(e.target.value)}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent-border"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-nativz-border/50 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            <X size={14} /> Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isEdit ? 'Save changes' : 'Create skill'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
