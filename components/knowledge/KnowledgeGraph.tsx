'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Minus, Maximize2, Play, Pause } from 'lucide-react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { KnowledgeGraphData } from '@/lib/knowledge/types';

// Sigma and FA2 worker need browser APIs — imported dynamically in useEffect

// Custom dark-themed hover renderer for Sigma
function drawDarkNodeHover(
  context: CanvasRenderingContext2D,
  data: { x: number; y: number; size: number; label?: string | null; color: string },
  settings: { labelFont: string; labelSize: number; labelWeight: string },
) {
  const size = settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;

  context.font = `${weight} ${size}px ${font}`;

  context.beginPath();
  context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  context.closePath();
  context.fillStyle = data.color;
  context.globalAlpha = 0.15;
  context.fill();
  context.globalAlpha = 1;

  if (typeof data.label === 'string') {
    const textWidth = context.measureText(data.label).width;
    const boxWidth = Math.round(textWidth + 10);
    const boxHeight = Math.round(size + 6);
    const radius = Math.max(data.size, size / 2) + 3;
    const xStart = data.x + radius;
    const yCenter = data.y;

    context.fillStyle = 'rgba(10, 14, 26, 0.92)';
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 2;
    context.shadowBlur = 8;
    context.shadowColor = 'rgba(0, 0, 0, 0.5)';

    const r = 4;
    context.beginPath();
    context.moveTo(xStart + r, yCenter - boxHeight / 2);
    context.lineTo(xStart + boxWidth - r, yCenter - boxHeight / 2);
    context.quadraticCurveTo(xStart + boxWidth, yCenter - boxHeight / 2, xStart + boxWidth, yCenter - boxHeight / 2 + r);
    context.lineTo(xStart + boxWidth, yCenter + boxHeight / 2 - r);
    context.quadraticCurveTo(xStart + boxWidth, yCenter + boxHeight / 2, xStart + boxWidth - r, yCenter + boxHeight / 2);
    context.lineTo(xStart + r, yCenter + boxHeight / 2);
    context.quadraticCurveTo(xStart, yCenter + boxHeight / 2, xStart, yCenter + boxHeight / 2 - r);
    context.lineTo(xStart, yCenter - boxHeight / 2 + r);
    context.quadraticCurveTo(xStart, yCenter - boxHeight / 2, xStart + r, yCenter - boxHeight / 2);
    context.closePath();
    context.fill();

    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';

    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.lineWidth = 0.5;
    context.stroke();

    context.fillStyle = '#f1f5f9';
    context.textBaseline = 'middle';
    context.fillText(data.label, xStart + 5, yCenter);
  }
}

// ── Colors ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  // Client knowledge entry types
  brand_profile: '#f59e0b',
  brand_guideline: '#eab308',
  web_page: '#06b6d4',
  note: '#a78bfa',
  document: '#64748b',
  idea: '#f472b6',
  idea_submission: '#f472b6',
  brand_asset: '#f59e0b',
  contact: '#fb923c',
  search: '#2dd4bf',
  strategy: '#f59e0b',
  meeting_note: '#a78bfa',
  // Knowledge node types (from merged agency graph)
  domain: '#f59e0b',
  playbook: '#38bdf8',
  client: '#22c55e',
  meeting: '#a78bfa',
  asset: '#64748b',
  insight: '#f472b6',
};

const DEFAULT_COLOR = '#64748b';
const DIMMED_COLOR = '#1a1d2e';
const BG_COLOR = '#0a0e1a';

// ── Build graph data ─────────────────────────────────────────────────────────

function buildGraphologyGraph(data: KnowledgeGraphData, nodeSize: number): Graph {
  const graph = new Graph();
  const scale = Math.sqrt(data.entries.length + data.externalNodes.length) * 10;

  // Count connections
  const connectionCounts = new Map<string, number>();
  for (const link of data.links) {
    const sourceId = link.source_type === 'entry' ? `entry-${link.source_id}` : `${link.source_type}-${link.source_id}`;
    const targetId = link.target_type === 'entry' ? `entry-${link.target_id}` : `${link.target_type}-${link.target_id}`;
    connectionCounts.set(sourceId, (connectionCounts.get(sourceId) ?? 0) + 1);
    connectionCounts.set(targetId, (connectionCounts.get(targetId) ?? 0) + 1);
  }

  // Add entry nodes
  for (const entry of data.entries) {
    const id = `entry-${entry.id}`;
    const count = connectionCounts.get(id) ?? 0;
    graph.addNode(id, {
      label: entry.title,
      size: Math.max(3, 2 + Math.sqrt(count) * 1.5) * (nodeSize / 3),
      color: TYPE_COLORS[entry.type] ?? DEFAULT_COLOR,
      kind: entry.type,
      entryId: entry.id,
      x: (Math.random() - 0.5) * scale,
      y: (Math.random() - 0.5) * scale,
    });
  }

  // Add external nodes
  for (const ext of data.externalNodes) {
    const id = `${ext.type}-${ext.id}`;
    if (graph.hasNode(id)) continue;
    const count = connectionCounts.get(id) ?? 0;
    graph.addNode(id, {
      label: ext.title,
      size: Math.max(3, 2 + Math.sqrt(count) * 1.5) * (nodeSize / 3),
      color: TYPE_COLORS[ext.type] ?? DEFAULT_COLOR,
      kind: ext.type,
      x: (Math.random() - 0.5) * scale,
      y: (Math.random() - 0.5) * scale,
    });
  }

  // Add edges
  const seenEdges = new Set<string>();
  for (const link of data.links) {
    const sourceId = link.source_type === 'entry' ? `entry-${link.source_id}` : `${link.source_type}-${link.source_id}`;
    const targetId = link.target_type === 'entry' ? `entry-${link.target_id}` : `${link.target_type}-${link.target_id}`;
    if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) continue;
    if (sourceId === targetId) continue;
    const key = [sourceId, targetId].sort().join('::');
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    graph.addEdge(sourceId, targetId, {
      size: 0.4,
      color: 'rgba(140,140,160,0.5)',
    });
  }

  return graph;
}

// ── Component ────────────────────────────────────────────────────────────────

interface KnowledgeGraphProps {
  data: KnowledgeGraphData;
  onNodeContextMenu?: (entryId: string, x: number, y: number) => void;
  onNodeClick?: (entryId: string) => void;
  selectedNodeId?: string | null;
  hoveredEntryId?: string | null;
  searchQuery?: string;
}

export function KnowledgeGraph({
  data,
  onNodeClick,
  selectedNodeId,
  searchQuery,
}: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigmaRef = useRef<InstanceType<any> | null>(null);
  const graphRef = useRef<Graph | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fa2Ref = useRef<InstanceType<any> | null>(null);

  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [nodeSize, setNodeSize] = useState(3);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [ready, setReady] = useState(false);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of data.entries) types.add(entry.type);
    for (const ext of data.externalNodes) types.add(ext.type);
    return Array.from(types).sort();
  }, [data]);

  useEffect(() => {
    setVisibleTypes(new Set(allTypes));
  }, [allTypes]);

  const isEmpty = data.entries.length === 0 && data.externalNodes.length === 0;

  // ── Build graph + Sigma renderer ──────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || isEmpty) return;

    setReady(false);
    let cancelled = false;

    async function init() {
      const [{ default: Sigma }, { default: FA2Layout }, { NodeCircleProgram, createNodeCompoundProgram, drawDiscNodeLabel }] = await Promise.all([
        import('sigma'),
        import('graphology-layout-forceatlas2/worker'),
        import('sigma/rendering'),
      ]);

      if (cancelled || !containerRef.current) return;

      // Clean up previous
      if (fa2Ref.current) { fa2Ref.current.kill(); fa2Ref.current = null; }
      if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }

      const graph = buildGraphologyGraph(data, nodeSize);

      // Pre-cluster with synchronous FA2
      const sensibleSettings = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: 200,
        settings: {
          ...sensibleSettings,
          gravity: 1,
          scalingRatio: 10,
          barnesHutOptimize: graph.order > 200,
          strongGravityMode: true,
          slowDown: 1,
        },
      });

      graphRef.current = graph;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DarkNodeProgram = createNodeCompoundProgram([NodeCircleProgram], drawDiscNodeLabel, drawDarkNodeHover as any);

      const renderer = new Sigma(graph, containerRef.current!, {
        renderEdgeLabels: false,
        labelFont: 'system-ui, -apple-system, sans-serif',
        labelSize: 12,
        labelWeight: '500',
        labelColor: { color: '#f1f5f9' },
        labelRenderedSizeThreshold: 6,
        defaultNodeColor: DEFAULT_COLOR,
        defaultEdgeColor: 'rgba(140,140,160,0.5)',
        stagePadding: 60,
        enableEdgeEvents: true,
        defaultNodeType: 'dark',
        nodeProgramClasses: {
          dark: DarkNodeProgram,
        },
      });

      sigmaRef.current = renderer;

      // FA2 worker for on-demand layout
      const fa2 = new FA2Layout(graph, {
        settings: {
          ...sensibleSettings,
          gravity: 1,
          scalingRatio: 10,
          barnesHutOptimize: graph.order > 200,
          strongGravityMode: true,
          slowDown: 2,
        },
      });
      fa2Ref.current = fa2;
      setLayoutRunning(false);
      setReady(true);

      // Node click
      renderer.on('clickNode', ({ node }: { node: string }) => {
        const entryId = graph.getNodeAttribute(node, 'entryId') as string | undefined;
        if (entryId && onNodeClick) onNodeClick(entryId);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (fa2Ref.current) { fa2Ref.current.kill(); fa2Ref.current = null; }
      if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isEmpty]);

  // ── Update node sizes ────────────────────────────────────────────────────

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.forEachNode((nodeId) => {
      const count = graph.degree(nodeId);
      graph.setNodeAttribute(nodeId, 'size', Math.max(3, 2 + Math.sqrt(count) * 1.5) * (nodeSize / 3));
    });
  }, [nodeSize]);

  // ── Reducers for hover, selection, search, type visibility ───────────────

  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    let hoveredNode: string | null = null;
    const selectedGraphId = selectedNodeId ? `entry-${selectedNodeId}` : null;

    function updateReducers() {
      const searchLower = (searchQuery ?? '').toLowerCase();
      const hasSearch = searchLower.length > 0;
      const hoveredNeighbors = hoveredNode ? new Set(graph!.neighbors(hoveredNode)) : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer!.setSetting('nodeReducer', (node: string, attrs: any) => {
        const res = { ...attrs };
        const kind = graph!.getNodeAttribute(node, 'kind') as string;

        if (!visibleTypes.has(kind)) { res.hidden = true; return res; }

        if (hoveredNeighbors) {
          if (node !== hoveredNode && !hoveredNeighbors.has(node)) {
            res.color = DIMMED_COLOR;
            res.label = '';
            return res;
          }
          if (node === hoveredNode) { res.highlighted = true; res.zIndex = 2; }
        }

        if (selectedGraphId === node) { res.highlighted = true; res.zIndex = 2; }

        if (hasSearch) {
          const label = (attrs.label ?? '') as string;
          if (label.toLowerCase().includes(searchLower)) {
            res.highlighted = true;
            res.zIndex = 1;
          } else if (!hoveredNeighbors) {
            res.color = DIMMED_COLOR;
            res.label = '';
          }
        }

        return res;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer!.setSetting('edgeReducer', (edge: string, attrs: any) => {
        const res = { ...attrs };
        const source = graph!.source(edge);
        const target = graph!.target(edge);
        const sourceKind = graph!.getNodeAttribute(source, 'kind') as string;
        const targetKind = graph!.getNodeAttribute(target, 'kind') as string;

        if (!visibleTypes.has(sourceKind) || !visibleTypes.has(targetKind)) { res.hidden = true; return res; }

        const isHoverEdge = hoveredNode && (source === hoveredNode || target === hoveredNode);
        const isSelectedEdge = selectedGraphId && (source === selectedGraphId || target === selectedGraphId);

        if (isHoverEdge) {
          res.hidden = false;
          res.color = 'rgba(160,165,180,0.6)';
          res.size = 0.8;
        } else if (isSelectedEdge && !hoveredNeighbors) {
          res.hidden = false;
          res.color = 'rgba(140,145,160,0.4)';
          res.size = 0.6;
        } else {
          res.hidden = true;
        }

        return res;
      });

      renderer!.refresh({ skipIndexation: true });
    }

    renderer.on('enterNode', ({ node }: { node: string }) => {
      hoveredNode = node;
      containerRef.current!.style.cursor = 'pointer';
      updateReducers();
    });

    renderer.on('leaveNode', () => {
      hoveredNode = null;
      containerRef.current!.style.cursor = 'grab';
      updateReducers();
    });

    updateReducers();
  }, [visibleTypes, selectedNodeId, searchQuery]);

  // ── Camera: focus on selected node ───────────────────────────────────────

  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !selectedNodeId) return;
    const graphId = `entry-${selectedNodeId}`;
    if (graph.hasNode(graphId)) {
      const pos = renderer.getNodeDisplayData(graphId);
      if (pos) {
        renderer.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.3 }, { duration: 400 });
      }
    }
  }, [selectedNodeId]);

  // ── Controls ─────────────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    const r = sigmaRef.current;
    if (!r) return;
    const c = r.getCamera();
    c.animate({ ratio: c.getState().ratio / 1.3 }, { duration: 200 });
  }, []);

  const handleZoomOut = useCallback(() => {
    const r = sigmaRef.current;
    if (!r) return;
    const c = r.getCamera();
    c.animate({ ratio: c.getState().ratio * 1.3 }, { duration: 200 });
  }, []);

  const handleFitToView = useCallback(() => {
    sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1 }, { duration: 300 });
  }, []);

  const handleToggleLayout = useCallback(() => {
    const fa2 = fa2Ref.current;
    if (!fa2) return;
    if (fa2.isRunning()) {
      fa2.stop();
      setLayoutRunning(false);
    } else {
      fa2.start();
      setLayoutRunning(true);
      setTimeout(() => {
        if (fa2.isRunning()) { fa2.stop(); setLayoutRunning(false); }
      }, 5000);
    }
  }, []);

  const handleToggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const sliderClassName = 'w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-text';

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: BG_COLOR }}>
      {isEmpty ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-sm">
            <p className="text-sm font-medium text-text-secondary">No knowledge entries yet</p>
            <p className="text-xs text-text-muted mt-1.5">
              Scrape a website or generate a brand profile to get started.
            </p>
          </div>
        </div>
      ) : (
        <>
          {!ready && (
            <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: BG_COLOR }}>
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                <p className="text-xs text-text-muted">Building graph layout...</p>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ cursor: 'grab', backgroundColor: BG_COLOR }}
          />

          {/* Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
            {allTypes.length > 0 && (
              <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-2.5 space-y-1.5 max-h-[280px] overflow-y-auto">
                {allTypes.map((type) => {
                  const color = TYPE_COLORS[type] ?? DEFAULT_COLOR;
                  const visible = visibleTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => handleToggleType(type)}
                      className={`cursor-pointer flex items-center gap-2 w-full text-left transition-opacity ${visible ? 'opacity-100' : 'opacity-30'}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[10px] text-text-secondary capitalize">{type.replace(/_/g, ' ')}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-2.5">
              <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Node size</label>
              <input type="range" min="1" max="8" step="0.5" value={nodeSize} onChange={(e) => setNodeSize(parseFloat(e.target.value))} className={sliderClassName} />
            </div>

            <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-1 flex flex-col gap-0.5">
              <button onClick={handleZoomIn} className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors" title="Zoom in"><Plus size={14} /></button>
              <button onClick={handleZoomOut} className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors" title="Zoom out"><Minus size={14} /></button>
              <div className="h-px bg-nativz-border mx-1" />
              <button onClick={handleFitToView} className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors" title="Fit to view"><Maximize2 size={14} /></button>
              <div className="h-px bg-nativz-border mx-1" />
              <button
                onClick={handleToggleLayout}
                className={`cursor-pointer p-1.5 rounded-md transition-colors ${layoutRunning ? 'text-accent-text bg-accent-surface/30 hover:bg-accent-surface/50' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}`}
                title={layoutRunning ? 'Stop layout' : 'Run ForceAtlas2 layout'}
              >
                {layoutRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
