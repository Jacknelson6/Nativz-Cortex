'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Shield, BookOpen, Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight,
  Github, ChevronDown, ChevronUp, Pencil, Check, ArrowLeft,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Skill {
  id: string;
  name: string;
  description: string;
  github_repo: string;
  github_path: string;
  github_branch: string;
  keywords: string[];
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

interface Guardrail {
  id: string;
  name: string;
  trigger_patterns: string[];
  category: string;
  response: string;
  priority: number;
  mode: 'short_circuit' | 'inject';
  is_active: boolean;
  created_at: string;
}

type Tab = 'skills' | 'guardrails';

const NERD_TABS: SubNavItem<Tab>[] = [
  { slug: 'skills', label: 'Skills', icon: <BookOpen size={13} /> },
  { slug: 'guardrails', label: 'Guardrails', icon: <Shield size={13} /> },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NerdSettingsPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('skills');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/admin/nerd'); return; }

      const { data } = await supabase
        .from('users')
        .select('is_super_admin')
        .eq('id', user.id)
        .single();
      if (!data?.is_super_admin) { router.replace('/admin/nerd'); return; }
      setIsSuperAdmin(true);
    })();
  }, [router]);

  if (isSuperAdmin === null) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-pulse text-text-muted text-sm">Checking permissions...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/admin/nerd')}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Nerd settings</h1>
          <p className="text-xs text-text-muted">Manage skills and guardrails for The Nerd AI</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <SubNav
          items={NERD_TABS}
          active={tab}
          onChange={setTab}
          ariaLabel="Nerd settings sections"
        />
      </div>

      {tab === 'skills' ? <SkillsTab /> : <GuardrailsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills Tab
// ---------------------------------------------------------------------------

function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => { loadSkills(); }, []);

  async function loadSkills() {
    const res = await fetch('/api/nerd/skills');
    if (res.ok) {
      const data = await res.json();
      setSkills(data.skills ?? []);
    }
    setLoading(false);
  }

  async function handleToggle(id: string, isActive: boolean) {
    const res = await fetch('/api/nerd/skills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    if (res.ok) {
      setSkills((prev) => prev.map((s) => s.id === id ? { ...s, is_active: !isActive } : s));
      toast.success(isActive ? 'Skill disabled' : 'Skill enabled');
    }
  }

  async function handleSync(id: string) {
    setSyncing(id);
    const res = await fetch('/api/nerd/skills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, sync: true }),
    });
    if (res.ok) {
      toast.success('Skill synced from GitHub');
      loadSkills();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Sync failed');
    }
    setSyncing(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/nerd/skills', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setSkills((prev) => prev.filter((s) => s.id !== id));
      toast.success('Skill deleted');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-text-secondary">
            Skills are markdown prompt templates loaded from GitHub repos. They&apos;re automatically matched to user messages by keyword.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
        >
          <Plus size={13} />
          Add skill
        </button>
      </div>

      {showAdd && <AddSkillForm onAdded={() => { setShowAdd(false); loadSkills(); }} onCancel={() => setShowAdd(false)} />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-elevated animate-pulse" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={24} className="mx-auto mb-2 text-text-muted/30" />
          <p className="text-sm text-text-muted">No skills added yet</p>
          <p className="text-xs text-text-muted/50 mt-1">Add skills from GitHub repos to extend The Nerd&apos;s expertise</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={`rounded-xl border px-4 py-3 transition-colors ${
                skill.is_active ? 'border-nativz-border bg-surface' : 'border-nativz-border/50 bg-surface/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{skill.name}</span>
                    <span className="text-[10px] text-text-muted/50 font-mono flex items-center gap-1">
                      <Github size={9} />
                      {skill.github_repo}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{skill.description}</p>
                  {skill.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {skill.keywords.slice(0, 8).map((kw) => (
                        <span key={kw} className="text-[10px] bg-accent/[0.06] text-accent-text px-1.5 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                      {skill.keywords.length > 8 && (
                        <span className="text-[10px] text-text-muted/40">+{skill.keywords.length - 8} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button
                    onClick={() => handleSync(skill.id)}
                    disabled={syncing === skill.id}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-accent-text hover:bg-accent/[0.06] transition-colors cursor-pointer disabled:opacity-50"
                    title="Sync from GitHub"
                  >
                    <RefreshCw size={13} className={syncing === skill.id ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => handleToggle(skill.id, skill.is_active)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-text-secondary transition-colors cursor-pointer"
                    title={skill.is_active ? 'Disable' : 'Enable'}
                  >
                    {skill.is_active ? <ToggleRight size={15} className="text-green-400" /> : <ToggleLeft size={15} />}
                  </button>
                  <button
                    onClick={() => handleDelete(skill.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-red-400 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddSkillForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [path, setPath] = useState('SKILL.md');
  const [branch, setBranch] = useState('main');
  const [keywords, setKeywords] = useState('');
  const [commandSlug, setCommandSlug] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !repo.trim()) return;

    // Client-side slug shape check — server repeats this, but catching it
    // here avoids a round-trip for obvious typos.
    const slug = commandSlug.trim();
    if (slug && !/^[a-z][a-z0-9-]{1,39}$/.test(slug)) {
      toast.error('Slug must be lowercase letters, digits, or dashes — no spaces');
      return;
    }

    setSaving(true);

    const res = await fetch('/api/nerd/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        github_repo: repo.trim(),
        github_path: path.trim() || 'SKILL.md',
        github_branch: branch.trim() || 'main',
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        command_slug: slug || null,
        prompt_template: promptTemplate.trim() || null,
      }),
    });

    if (res.ok) {
      toast.success('Skill added and synced from GitHub');
      onAdded();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Failed to add skill');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-accent/20 bg-accent/[0.02] p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. content-strategy"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">GitHub repo</label>
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">File path</label>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="SKILL.md"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Branch</label>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Extra keywords (comma-separated)</label>
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="seo, strategy, hooks"
          className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
        />
      </div>

      {/* Slash command wiring — optional. When set, the skill shows up in the
          Nerd's slash menu as /slug. Leave blank to keep the skill as
          keyword-match-only (invisible but still injected when relevant). */}
      <div className="space-y-2 rounded-lg border border-accent/20 bg-background/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Slash command (optional)</p>
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <div>
            <label className="text-[10px] font-medium text-text-muted">Slug</label>
            <input
              value={commandSlug}
              onChange={(e) => setCommandSlug(e.target.value)}
              placeholder="cold-email"
              className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary outline-none focus:border-accent/30"
            />
            <p className="mt-1 text-[10px] text-text-muted/70">lowercase, dashes ok</p>
          </div>
          <div>
            <label className="text-[10px] font-medium text-text-muted">Prompt template</label>
            <textarea
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              placeholder="Using the skill below, help with: {args}&#10;&#10;---&#10;{content}"
              rows={3}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30 font-mono"
            />
            <p className="mt-1 text-[10px] text-text-muted/70">
              {'{args}'} = user input after /slug, {'{content}'} = full skill markdown
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !repo.trim()}
          className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? 'Syncing...' : 'Add & sync'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Guardrails Tab
// ---------------------------------------------------------------------------

function GuardrailsTab() {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadGuardrails(); }, []);

  async function loadGuardrails() {
    const res = await fetch('/api/nerd/guardrails');
    if (res.ok) {
      const data = await res.json();
      setGuardrails(data.guardrails ?? []);
    }
    setLoading(false);
  }

  async function handleToggle(id: string, isActive: boolean) {
    const res = await fetch('/api/nerd/guardrails', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    if (res.ok) {
      setGuardrails((prev) => prev.map((g) => g.id === id ? { ...g, is_active: !isActive } : g));
      toast.success(isActive ? 'Guardrail disabled' : 'Guardrail enabled');
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/nerd/guardrails', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setGuardrails((prev) => prev.filter((g) => g.id !== id));
      toast.success('Guardrail deleted');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-text-secondary">
            Guardrails intercept sensitive questions before the LLM and return exact responses. Handles jailbreak attempts automatically.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
        >
          <Plus size={13} />
          Add guardrail
        </button>
      </div>

      {showAdd && <AddGuardrailForm onAdded={() => { setShowAdd(false); loadGuardrails(); }} onCancel={() => setShowAdd(false)} />}

      {/* Built-in protection notice */}
      <div className="rounded-xl border border-accent2/20 bg-accent2/[0.03] px-4 py-3 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={13} className="text-accent2-text" />
          <span className="text-xs font-medium text-accent2-text">Built-in protection</span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          The Nerd has hardcoded jailbreak detection that runs independently of these rules. It catches prompt injection, system prompt extraction, role-play exploits, encoding tricks, and indirect probing — even when users rephrase or use hypothetical framing.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-elevated animate-pulse" />
          ))}
        </div>
      ) : guardrails.length === 0 ? (
        <div className="text-center py-12">
          <Shield size={24} className="mx-auto mb-2 text-text-muted/30" />
          <p className="text-sm text-text-muted">No custom guardrails</p>
          <p className="text-xs text-text-muted/50 mt-1">Built-in protection still active</p>
        </div>
      ) : (
        <div className="space-y-2">
          {guardrails.map((g) => (
            <GuardrailCard
              key={g.id}
              guardrail={g}
              expanded={editingId === g.id}
              onToggleExpand={() => setEditingId(editingId === g.id ? null : g.id)}
              onToggleActive={() => handleToggle(g.id, g.is_active)}
              onDelete={() => handleDelete(g.id)}
              onUpdated={loadGuardrails}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GuardrailCard({
  guardrail: g,
  expanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
  onUpdated,
}: {
  guardrail: Guardrail;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [response, setResponse] = useState(g.response);
  const [patterns, setPatterns] = useState(g.trigger_patterns.join(', '));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch('/api/nerd/guardrails', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: g.id,
        response: response.trim(),
        trigger_patterns: patterns.split(',').map((p) => p.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      toast.success('Guardrail updated');
      setEditing(false);
      onUpdated();
    } else {
      toast.error('Failed to update');
    }
    setSaving(false);
  }

  return (
    <div className={`rounded-xl border px-4 py-3 transition-colors ${
      g.is_active ? 'border-nativz-border bg-surface' : 'border-nativz-border/50 bg-surface/50 opacity-60'
    }`}>
      <div className="flex items-center justify-between">
        <button onClick={onToggleExpand} className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer">
          {expanded ? <ChevronUp size={13} className="text-text-muted shrink-0" /> : <ChevronDown size={13} className="text-text-muted shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">{g.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                g.mode === 'short_circuit' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
              }`}>
                {g.mode === 'short_circuit' ? 'blocks LLM' : 'injects instruction'}
              </span>
              <span className="text-[10px] text-text-muted/40">priority {g.priority}</span>
            </div>
            <p className="text-xs text-text-muted mt-0.5 truncate">
              {g.trigger_patterns.slice(0, 3).join(' · ')}{g.trigger_patterns.length > 3 ? ` · +${g.trigger_patterns.length - 3} more` : ''}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <button onClick={onToggleActive} className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-text-secondary transition-colors cursor-pointer">
            {g.is_active ? <ToggleRight size={15} className="text-green-400" /> : <ToggleLeft size={15} />}
          </button>
          <button onClick={onDelete} className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-red-400 transition-colors cursor-pointer">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-nativz-border/50 space-y-3">
          {!editing ? (
            <>
              <div>
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Trigger patterns</p>
                <div className="flex flex-wrap gap-1">
                  {g.trigger_patterns.map((p, i) => (
                    <span key={i} className="text-[10px] bg-surface-hover px-2 py-0.5 rounded text-text-secondary">{p}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Response</p>
                <p className="text-xs text-text-secondary bg-surface-hover rounded-lg px-3 py-2 leading-relaxed">{g.response}</p>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs text-accent-text hover:text-accent cursor-pointer"
              >
                <Pencil size={11} />
                Edit
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Trigger patterns (comma-separated)</label>
                <textarea
                  value={patterns}
                  onChange={(e) => setPatterns(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent/30 resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Response</label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent/30 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent text-white text-xs cursor-pointer disabled:opacity-50">
                  <Check size={11} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setResponse(g.response); setPatterns(g.trigger_patterns.join(', ')); }} className="px-3 py-1 text-xs text-text-muted hover:text-text-secondary cursor-pointer">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AddGuardrailForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [patterns, setPatterns] = useState('');
  const [response, setResponse] = useState('');
  const [mode, setMode] = useState<'short_circuit' | 'inject'>('short_circuit');
  const [priority, setPriority] = useState(50);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !patterns.trim() || !response.trim()) return;
    setSaving(true);

    const res = await fetch('/api/nerd/guardrails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        category: category.trim(),
        trigger_patterns: patterns.split(',').map((p) => p.trim()).filter(Boolean),
        response: response.trim(),
        mode,
        priority,
      }),
    });

    if (res.ok) {
      toast.success('Guardrail added');
      onAdded();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Failed to add');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-accent/20 bg-accent/[0.02] p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pricing block"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="identity, agency_loyalty, security"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Trigger patterns (comma-separated)</label>
        <textarea
          value={patterns}
          onChange={(e) => setPatterns(e.target.value)}
          rows={2}
          placeholder="what model are you, which ai are you, are you gpt"
          className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30 resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Response</label>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={3}
          placeholder="The exact response The Nerd will give"
          className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'short_circuit' | 'inject')}
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          >
            <option value="short_circuit">Block LLM (exact response)</option>
            <option value="inject">Inject instruction (LLM guided)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Priority (higher = checked first)</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            min={0}
            max={1000}
            className="mt-1 w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !patterns.trim() || !response.trim()}
          className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? 'Adding...' : 'Add guardrail'}
        </button>
      </div>
    </form>
  );
}
