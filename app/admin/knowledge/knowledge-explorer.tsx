'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Pencil,
  Save,
  Loader2,
  Link2,
  ExternalLink,
  Search,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { AgencyKnowledgeGraph } from './agency-knowledge-graph';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

// ── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeNode {
  id: string;
  kind: string;
  title: string;
  domain: string[];
  tags: string[];
  connections: string[];
  client_id: string | null;
  content?: string;
  metadata?: Record<string, unknown>;
  sync_status?: string;
  created_at?: string;
  updated_at?: string;
}

interface GraphNode {
  id: string;
  kind: string;
  title: string;
  domain: string[];
  client_id: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface ClientOption {
  id: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  domain: '#f59e0b',
  playbook: '#38bdf8',
  client: '#22c55e',
  meeting: '#a78bfa',
  asset: '#64748b',
  insight: '#f472b6',
  'web-page': '#06b6d4',
  'brand-profile': '#f59e0b',
  'brand-guideline': '#eab308',
};

const KIND_BADGE_COLORS: Record<string, string> = {
  domain: 'bg-amber-500/15 text-amber-400',
  playbook: 'bg-sky-500/15 text-sky-400',
  client: 'bg-green-500/15 text-green-400',
  meeting: 'bg-accent2/15 text-accent2-text',
  asset: 'bg-slate-500/15 text-slate-400',
  insight: 'bg-pink-500/15 text-pink-400',
  'web-page': 'bg-cyan-500/15 text-cyan-400',
  'brand-profile': 'bg-amber-500/15 text-amber-400',
  'brand-guideline': 'bg-yellow-500/15 text-yellow-400',
};

// AC brand palette badges — darker text for light backgrounds
const AC_KIND_BADGE_COLORS: Record<string, string> = {
  domain: 'bg-teal-500/12 text-teal-700',
  playbook: 'bg-teal-600/12 text-teal-800',
  client: 'bg-slate-800/10 text-slate-900',
  meeting: 'bg-slate-500/12 text-slate-700',
  asset: 'bg-slate-400/12 text-slate-600',
  insight: 'bg-red-500/12 text-red-700',
  'web-page': 'bg-teal-500/12 text-teal-700',
  'brand-profile': 'bg-slate-800/10 text-slate-900',
  'brand-guideline': 'bg-teal-600/12 text-teal-800',
};

// ── Main component ───────────────────────────────────────────────────────────

export function KnowledgeExplorer() {
  const { mode: brandMode } = useBrandMode();
  const isAC = brandMode === 'anderson';

  // Data state
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state — only client filter
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Collapsed groups in node list
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<KnowledgeNode | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Fetch clients ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch('/api/clients');
        if (res.ok) {
          const data = await res.json();
          setClients((data.clients ?? data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch {
        // Non-critical
      }
    }
    fetchClients();
  }, []);

  // ── Build query params ─────────────────────────────────────────────────────

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (clientFilter === 'agency') params.set('client_id', 'agency');
    else if (clientFilter !== 'all') params.set('client_id', clientFilter);
    // In AC mode, filter to paid-media domain nodes by default
    if (isAC && clientFilter === 'all') params.set('domain', 'paid-media');
    return params.toString();
  }, [clientFilter, isAC]);

  // ── Fetch graph data ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const qs = buildParams();

    try {
      const [nodesRes, graphRes] = await Promise.all([
        fetch(`/api/knowledge/nodes?limit=4000${qs ? '&' + qs : ''}`),
        fetch(`/api/knowledge/graph?limit=4000${qs ? '&' + qs : ''}`),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        setNodes(data.nodes ?? []);
      }

      if (graphRes.ok) {
        const data = await graphRes.json();
        setGraphData({ nodes: data.nodes ?? [], edges: data.edges ?? [] });
      }
    } catch (err) {
      console.warn('Failed to fetch knowledge data:', err);
      toast.error('Failed to load knowledge graph');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Search with debounce ───────────────────────────────────────────────────

  const handleSearchInput = useCallback((value: string) => {
    setSearchInputValue(value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(searchTimeoutRef.current);
  }, []);

  // ── Select node (from graph) ──────────────────────────────────────────────

  const handleSelectNode = useCallback(async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setEditing(false);

    setDetailLoading(true);
    try {
      const res = await fetch(`/api/knowledge/nodes/${encodeURIComponent(nodeId)}`);
      if (res.ok) {
        const data = await res.json();
        setDetailNode(data.node ?? null);
      }
    } catch {
      toast.error('Failed to load node details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNodeId(null);
    setDetailNode(null);
    setEditing(false);
  }, []);

  // ── Save edits ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!detailNode) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/knowledge/nodes/${encodeURIComponent(detailNode.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setDetailNode(data.node);
        setEditing(false);
        toast.success('Node saved');
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [detailNode, editTitle, editContent]);

  const startEditing = useCallback(() => {
    if (!detailNode) return;
    setEditTitle(detailNode.title);
    setEditContent(detailNode.content ?? '');
    setEditing(true);
  }, [detailNode]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editing) setEditing(false);
        else handleCloseDetail();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, handleCloseDetail]);

  // ── Group nodes by kind (filtered by search) ────────────────────────────

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return nodes;
    const lower = searchQuery.toLowerCase();
    return nodes.filter((n) => n.title.toLowerCase().includes(lower));
  }, [nodes, searchQuery]);

  const groupedNodes = useMemo(() => {
    const groups = new Map<string, KnowledgeNode[]>();
    for (const node of filteredNodes) {
      const list = groups.get(node.kind) ?? [];
      list.push(node);
      groups.set(node.kind, list);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredNodes]);

  const toggleGroup = useCallback((kind: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Page header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-nativz-border bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="ui-section-title">Knowledge graph</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {graphData.nodes.length} nodes &middot; {graphData.edges.length} connections
            </p>
          </div>

          {/* Client picker */}
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent/30"
          >
            <option value="all">All clients</option>
            <option value="agency">Agency only</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchInputValue}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="Search nodes..."
              className="w-56 rounded-lg border border-nativz-border bg-background pl-8 pr-8 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
            {searchInputValue && (
              <button
                onClick={() => { setSearchInputValue(''); setSearchQuery(''); }}
                className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Main content: node list + graph + detail */}
      <div className="flex flex-1 min-h-0 relative">
        {/* ── Left panel: node list ── */}
        <div className="w-64 shrink-0 border-r border-nativz-border bg-surface flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && nodes.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={16} className="animate-spin text-text-muted" />
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-text-muted">No nodes found</p>
              </div>
            ) : (
              <div className="py-1">
                {groupedNodes.map(([kind, kindNodes]) => {
                  const isCollapsed = collapsedGroups.has(kind);
                  const color = KIND_COLORS[kind] ?? '#64748b';
                  return (
                    <div key={kind}>
                      <button
                        onClick={() => toggleGroup(kind)}
                        className="cursor-pointer w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        <ChevronRight
                          size={12}
                          className={`shrink-0 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}
                        />
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="capitalize truncate">{kind.replace(/_/g, ' ')}</span>
                        <span className="ml-auto text-[10px] text-text-muted tabular-nums">{kindNodes.length}</span>
                      </button>
                      {!isCollapsed && (
                        <div>
                          {kindNodes.map((node) => (
                            <button
                              key={node.id}
                              onClick={() => handleSelectNode(node.id)}
                              className={`cursor-pointer w-full text-left pl-8 pr-3 py-1 text-[11px] transition-colors truncate ${
                                selectedNodeId === node.id
                                  ? 'bg-accent-surface text-accent-text'
                                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                              }`}
                            >
                              {node.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Graph ── */}
        <div className="flex-1 min-w-0 relative">
          {loading && graphData.nodes.length === 0 ? (
            <div className={`flex items-center justify-center h-full ${isAC ? 'bg-[#F4F6F8]' : 'bg-[#0a0e1a]'}`}>
              <Loader2 size={24} className="animate-spin text-text-muted" />
            </div>
          ) : (
            <AgencyKnowledgeGraph
              data={graphData}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleSelectNode}
              searchQuery={searchQuery}
            />
          )}
        </div>

        {/* ── Detail panel (slide-in from right) ── */}
        {selectedNodeId && (
          <>
            <div
              className="absolute right-0 top-0 bottom-0 w-[400px] pointer-events-none z-20"
              style={{ boxShadow: isAC ? '-8px 0 24px rgba(0, 22, 31, 0.12)' : '-8px 0 24px rgba(0, 0, 0, 0.4)' }}
            />

            <div
              className="absolute right-0 top-0 bottom-0 w-[400px] z-30 bg-surface border-l border-nativz-border overflow-y-auto"
              style={{ animation: 'slideInRight 0.2s ease-out' }}
            >
              {detailLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={18} className="animate-spin text-text-muted" />
                </div>
              ) : detailNode ? (
                <div className="flex flex-col h-full">
                  {/* Detail header */}
                  <div className="flex items-start justify-between gap-3 p-4 border-b border-nativz-border shrink-0">
                    <div className="flex-1 min-w-0">
                      {editing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-background border border-nativz-border rounded-md px-2 py-1 text-sm font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/30"
                        />
                      ) : (
                        <h2 className="text-sm font-semibold text-text-primary break-words">{detailNode.title}</h2>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            (isAC ? AC_KIND_BADGE_COLORS : KIND_BADGE_COLORS)[detailNode.kind] ?? 'bg-slate-500/15 text-slate-400'
                          }`}
                        >
                          {detailNode.kind.replace(/_/g, ' ')}
                        </span>
                        {detailNode.domain?.map((d) => (
                          <span key={d} className="inline-flex rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            {d.replace(/-/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleCloseDetail}
                      className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Tags */}
                  {detailNode.tags && detailNode.tags.length > 0 && (
                    <div className="px-4 pt-3 flex flex-wrap gap-1">
                      {detailNode.tags.map((tag) => (
                        <span key={tag} className="inline-flex rounded-full bg-background px-2 py-0.5 text-[10px] text-text-muted">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 p-4 min-h-0 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-medium text-text-secondary">Content</h3>
                      <div className="flex items-center gap-1.5">
                        {editing ? (
                          <>
                            <button
                              onClick={() => setEditing(false)}
                              className="cursor-pointer rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSave}
                              disabled={saving}
                              className="cursor-pointer flex items-center gap-1 rounded-md bg-accent-surface px-2.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-surface/80 transition-colors disabled:opacity-50"
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              Save
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={startEditing}
                            className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    {editing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full h-[calc(100%-2rem)] min-h-[200px] bg-background rounded-lg border border-nativz-border p-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none leading-relaxed"
                        placeholder="Markdown content..."
                      />
                    ) : (
                      <div className="text-xs text-text-primary whitespace-pre-wrap break-words bg-background rounded-lg p-3 max-h-[300px] overflow-y-auto leading-relaxed">
                        {detailNode.content || <span className="text-text-muted">No content</span>}
                      </div>
                    )}
                  </div>

                  {/* Connections */}
                  {detailNode.connections && detailNode.connections.length > 0 && (
                    <div className="px-4 pb-4 border-t border-nativz-border pt-3 shrink-0">
                      <h3 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5">
                        <Link2 size={12} />
                        Connections ({detailNode.connections.length})
                      </h3>
                      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                        {detailNode.connections.map((connId) => (
                          <button
                            key={connId}
                            onClick={() => handleSelectNode(connId)}
                            className="cursor-pointer w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                          >
                            <ExternalLink size={11} className="shrink-0 text-text-muted" />
                            <span className="truncate">{connId}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Created at */}
                  {detailNode.created_at && (
                    <div className="px-4 pb-3 shrink-0">
                      <p className="text-[10px] text-text-muted">
                        Created {new Date(detailNode.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        {detailNode.updated_at && detailNode.updated_at !== detailNode.created_at && (
                          <> &middot; Updated {new Date(detailNode.updated_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-xs text-text-muted">Node not found</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
