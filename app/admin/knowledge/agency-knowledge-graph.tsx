'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Minus, Maximize2, Play, Pause } from 'lucide-react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

// Sigma and FA2 worker need browser APIs — imported dynamically in useEffect to avoid SSR crashes

// Shared hover theme — set by component before Sigma renders
interface GraphTheme {
  defaultColor: string;
  dimmedColor: string;
  bgColor: string;
  edgeColor: string;
  edgeHoverColor: string;
  edgeSelectedColor: string;
  labelColor: string;
  hoverBg: string;
  hoverBorder: string;
}
let _hoverTheme: GraphTheme;

// Custom themed hover renderer for Sigma
function drawThemedNodeHover(
  context: CanvasRenderingContext2D,
  data: { x: number; y: number; size: number; label?: string | null; color: string },
  settings: { labelFont: string; labelSize: number; labelWeight: string },
) {
  const size = settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
  const theme = _hoverTheme;

  context.font = `${weight} ${size}px ${font}`;

  // Draw glow around node
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

    // Label background with rounded corners
    context.fillStyle = theme.hoverBg;
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

    context.strokeStyle = theme.hoverBorder;
    context.lineWidth = 0.5;
    context.stroke();

    context.fillStyle = theme.labelColor;
    context.textBaseline = 'middle';
    context.fillText(data.label, xStart + 5, yCenter);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Colors ───────────────────────────────────────────────────────────────────

// Nativz brand palette (dark mode)
const NATIVZ_TYPE_COLORS: Record<string, string> = {
  domain: '#f59e0b',           // Gold — top-level navigation
  playbook: '#38bdf8',         // Blue — consolidated knowledge
  client: '#22c55e',           // Green — client source of truth
  meeting: '#a78bfa',          // Purple — meeting notes
  asset: '#64748b',            // Slate — docs, templates, projects
  insight: '#f472b6',          // Pink — industry insights
  'web-page': '#06b6d4',      // Cyan — scraped website pages
  'brand-profile': '#f59e0b', // Gold — brand profile
  'brand-guideline': '#eab308', // Yellow — brand DNA guideline
  'visual-identity': '#06b6d4',   // Cyan
  'verbal-identity': '#f97316',   // Orange
  'brand-logo': '#eab308',        // Gold
  'brand-screenshot': '#14b8a6',  // Teal
  'product-catalog': '#22c55e',   // Green
  'target-audience': '#ec4899',   // Pink
  'competitive-positioning': '#ef4444', // Red
};

// Anderson Collaborative brand palette (light mode — AC design tokens)
const AC_TYPE_COLORS: Record<string, string> = {
  domain: '#36D1C2',           // AC Teal — top-level navigation
  playbook: '#2BB5A8',         // AC Teal Dark — consolidated knowledge
  client: '#00161F',           // AC Navy — client source of truth
  meeting: '#617792',          // AC Blue-gray — meeting notes
  asset: '#8A99A8',            // AC Silver (darkened) — docs, templates, projects
  insight: '#E54B4B',          // AC Red — industry insights
  'web-page': '#36D1C2',      // AC Teal
  'brand-profile': '#00161F', // AC Navy
  'brand-guideline': '#2BB5A8', // AC Teal Dark
  'visual-identity': '#36D1C2',
  'verbal-identity': '#617792',
  'brand-logo': '#00161F',
  'brand-screenshot': '#8A99A8',
  'product-catalog': '#2BB5A8',
  'target-audience': '#E54B4B',
  'competitive-positioning': '#617792',
};

// Theme-dependent constants
const NATIVZ_THEME: GraphTheme = {
  defaultColor: '#64748b',
  dimmedColor: '#1a1d2e',
  bgColor: '#0a0e1a',
  edgeColor: '#1e2338',           // Dark blue-gray — subtly visible against #0a0e1a
  edgeHoverColor: 'rgba(160,165,180,0.6)',
  edgeSelectedColor: 'rgba(140,145,160,0.4)',
  labelColor: '#f1f5f9',
  hoverBg: 'rgba(10, 14, 26, 0.92)',
  hoverBorder: 'rgba(255, 255, 255, 0.08)',
};

const AC_THEME: GraphTheme = {
  defaultColor: '#B3BEC9',
  dimmedColor: '#E8ECF0',
  bgColor: '#F4F6F8',
  edgeColor: '#D6DCE2',           // Light gray — subtly visible against #F4F6F8
  edgeHoverColor: 'rgba(0,22,31,0.5)',
  edgeSelectedColor: 'rgba(0,22,31,0.3)',
  labelColor: '#00161F',
  hoverBg: 'rgba(255, 255, 255, 0.95)',
  hoverBorder: 'rgba(0, 0, 0, 0.1)',
};

// ── Component ────────────────────────────────────────────────────────────────

interface AgencyKnowledgeGraphProps {
  data: GraphData;
  onNodeClick?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  searchQuery?: string;
}

export function AgencyKnowledgeGraph({
  data,
  onNodeClick,
  selectedNodeId,
  searchQuery,
}: AgencyKnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigmaRef = useRef<InstanceType<any> | null>(null);
  const graphRef = useRef<Graph | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fa2Ref = useRef<InstanceType<any> | null>(null);

  const { mode: brandMode } = useBrandMode();
  const isAC = brandMode === 'anderson';
  const TYPE_COLORS = isAC ? AC_TYPE_COLORS : NATIVZ_TYPE_COLORS;
  const theme = isAC ? AC_THEME : NATIVZ_THEME;

  // Keep hover renderer in sync with current theme
  _hoverTheme = theme;

  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [nodeSize, setNodeSize] = useState(3);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [ready, setReady] = useState(false);

  // All types present in the graph
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    for (const n of data.nodes) types.add(n.kind);
    return Array.from(types).sort();
  }, [data]);

  // Initialize visible types when data changes
  useEffect(() => {
    setVisibleTypes(new Set(allTypes));
  }, [allTypes]);

  // ── Build Graphology graph + Sigma renderer ──────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    if (data.nodes.length === 0) return;

    setReady(false);
    let cancelled = false;

    // Dynamic imports — Sigma and FA2Worker need browser globals
    async function init() {
      const [{ default: Sigma }, { default: FA2Layout }, { NodeCircleProgram, createNodeCompoundProgram, drawDiscNodeLabel }] = await Promise.all([
        import('sigma'),
        import('graphology-layout-forceatlas2/worker'),
        import('sigma/rendering'),
      ]);

      if (cancelled || !containerRef.current) return;

      // Clean up previous
      if (fa2Ref.current) {
        fa2Ref.current.kill();
        fa2Ref.current = null;
      }
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }

      // Create graphology graph
      const graph = new Graph();

      // Add nodes with random initial positions
      // Pre-compute connection counts in O(n+m) instead of O(n*m)
      const connectionCounts = new Map<string, number>();
      for (const edge of data.edges) {
        connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
        connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
      }

      const nodeIds = new Set<string>();
      const scale = Math.sqrt(data.nodes.length) * 10;
      const MAX_NODE_SIZE = 18; // Cap so domain nodes aren't overbearing
      for (const node of data.nodes) {
        if (nodeIds.has(node.id)) continue;
        nodeIds.add(node.id);

        const connectionCount = connectionCounts.get(node.id) ?? 0;
        // Reduced multipliers — domains 2x instead of 4x, playbooks 1.8x instead of 2.5x
        const kindSizeMultiplier = node.kind === 'domain' ? 2 : node.kind === 'playbook' ? 1.8 : 1;
        const rawSize = Math.max(3, 2 + Math.sqrt(connectionCount) * 1.5) * (nodeSize / 3) * kindSizeMultiplier;
        const baseSize = Math.min(rawSize, MAX_NODE_SIZE);

        graph.addNode(node.id, {
          label: node.title,
          size: baseSize,
          color: TYPE_COLORS[node.kind] ?? theme.defaultColor,
          kind: node.kind,
          x: (Math.random() - 0.5) * scale,
          y: (Math.random() - 0.5) * scale,
        });
      }

      // Add edges
      const seenEdges = new Set<string>();
      for (const edge of data.edges) {
        if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
        if (edge.source === edge.target) continue;
        const key = [edge.source, edge.target].sort().join('::');
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);

        graph.addEdge(edge.source, edge.target, {
          size: 0.3,
          color: theme.edgeColor,
        });
      }

      // Run ForceAtlas2 synchronously to pre-cluster before rendering
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

      // Custom node program with themed hover
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ThemedNodeProgram = createNodeCompoundProgram([NodeCircleProgram], drawDiscNodeLabel, drawThemedNodeHover as any);

      // Create Sigma renderer — edges visible as subtle lines, brighten on hover
      const renderer = new Sigma(graph, containerRef.current!, {
        renderEdgeLabels: false,
        labelFont: 'system-ui, -apple-system, sans-serif',
        labelSize: 12,
        labelWeight: '500',
        labelColor: { color: theme.labelColor },
        labelRenderedSizeThreshold: 100,
        defaultNodeColor: theme.defaultColor,
        defaultEdgeColor: theme.edgeColor,
        stagePadding: 60,
        enableEdgeEvents: true,
        defaultNodeType: 'themed',
        nodeProgramClasses: {
          themed: ThemedNodeProgram,
        },
      });

      sigmaRef.current = renderer;

      // Set up FA2 worker for on-demand layout (play/pause button)
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

      // Handle node click
      renderer.on('clickNode', ({ node }: { node: string }) => {
        if (onNodeClick) onNodeClick(node);
      });

    }

    init();

    return () => {
      cancelled = true;
      if (fa2Ref.current) {
        fa2Ref.current.kill();
        fa2Ref.current = null;
      }
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      graphRef.current = null;
    };
    // Rebuild on data or brand mode changes — other state handled via reducers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, brandMode]);

  // ── Update node sizes when slider changes ────────────────────────────────

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const MAX_NODE_SIZE = 18;

    graph.forEachNode((nodeId) => {
      const connectionCount = graph.degree(nodeId);
      const kind = graph.getNodeAttribute(nodeId, 'kind') as string;
      const kindMul = kind === 'domain' ? 2 : kind === 'playbook' ? 1.8 : 1;
      const raw = Math.max(3, 2 + Math.sqrt(connectionCount) * 1.5) * (nodeSize / 3) * kindMul;
      graph.setNodeAttribute(nodeId, 'size', Math.min(raw, MAX_NODE_SIZE));
    });
  }, [nodeSize]);

  // ── Apply reducers for hover, selection, search, type visibility ─────────

  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    let hoveredNode: string | null = null;

    function updateReducers() {
      const searchLower = (searchQuery ?? '').toLowerCase();
      const hasSearch = searchLower.length > 0;

      const hoveredNeighbors = hoveredNode
        ? new Set(graph!.neighbors(hoveredNode))
        : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer!.setSetting('nodeReducer', (node: string, attrs: any) => {
        const res = { ...attrs };
        const kind = graph!.getNodeAttribute(node, 'kind') as string;

        // Type visibility
        if (!visibleTypes.has(kind)) {
          res.hidden = true;
          return res;
        }

        // Hover dimming
        if (hoveredNeighbors) {
          if (node !== hoveredNode && !hoveredNeighbors.has(node)) {
            res.color = theme.dimmedColor;
            res.label = '';
            res.zIndex = 0;
            return res;
          }
          if (node === hoveredNode) {
            res.highlighted = true;
            res.zIndex = 2;
          }
        }

        // Selection highlight
        if (selectedNodeId === node) {
          res.highlighted = true;
          res.zIndex = 2;
        }

        // Search highlighting
        if (hasSearch) {
          const label = (attrs.label ?? '') as string;
          if (label.toLowerCase().includes(searchLower)) {
            res.highlighted = true;
            res.zIndex = 1;
          } else if (!hoveredNeighbors) {
            res.color = theme.dimmedColor;
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

        // Hide edges for hidden types
        if (!visibleTypes.has(sourceKind) || !visibleTypes.has(targetKind)) {
          res.hidden = true;
          return res;
        }

        // Edges always visible — subtle by default, brighten on hover/select
        const isHoverEdge = hoveredNode && (source === hoveredNode || target === hoveredNode);
        const isSelectedEdge = selectedNodeId && (source === selectedNodeId || target === selectedNodeId);

        if (isHoverEdge) {
          res.color = theme.edgeHoverColor;
          res.size = 0.8;
          res.zIndex = 1;
        } else if (isSelectedEdge && !hoveredNeighbors) {
          res.color = theme.edgeSelectedColor;
          res.size = 0.6;
        } else if (hoveredNeighbors) {
          // Dim non-connected edges when hovering a node
          res.hidden = true;
        } else {
          // Default: subtle visible edges
          res.color = theme.edgeColor;
          res.size = 0.3;
        }

        return res;
      });

      renderer!.refresh({ skipIndexation: true });
    }

    // Bind hover events
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

    // Apply initial state
    updateReducers();

    // Sigma doesn't expose a way to unbind single listeners cleanly,
    // so we rely on the parent effect cleaning up the whole renderer
  }, [visibleTypes, selectedNodeId, searchQuery, theme]);

  // ── Camera: focus on selected node ───────────────────────────────────────

  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !selectedNodeId) return;

    if (graph.hasNode(selectedNodeId)) {
      const pos = renderer.getNodeDisplayData(selectedNodeId);
      if (pos) {
        renderer.getCamera().animate(
          { x: pos.x, y: pos.y, ratio: 0.3 },
          { duration: 400 },
        );
      }
    }
  }, [selectedNodeId]);

  // ── Controls ─────────────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    camera.animate({ ratio: camera.getState().ratio / 1.3 }, { duration: 200 });
  }, []);

  const handleZoomOut = useCallback(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    camera.animate({ ratio: camera.getState().ratio * 1.3 }, { duration: 200 });
  }, []);

  const handleFitToView = useCallback(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1 }, { duration: 300 });
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
      // Auto-stop after 5s
      setTimeout(() => {
        if (fa2.isRunning()) {
          fa2.stop();
          setLayoutRunning(false);
        }
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

  const isEmpty = data.nodes.length === 0;

  const sliderClassName = isAC
    ? 'w-full h-1 bg-black/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-text'
    : 'w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-text';

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: theme.bgColor }}>
      {isEmpty ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-sm">
            <p className="text-sm font-medium text-text-secondary">
              No knowledge nodes yet
            </p>
            <p className="text-xs text-text-muted mt-1.5">
              Import nodes from your knowledge graph or create a new one to get
              started.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Loading overlay */}
          {!ready && (
            <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: theme.bgColor }}>
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                <p className="text-xs text-text-muted">Building graph layout...</p>
              </div>
            </div>
          )}

          {/* Sigma.js container */}
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ cursor: 'grab', backgroundColor: theme.bgColor }}
          />

          {/* Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
            {/* Type filters */}
            {allTypes.length > 0 && (
              <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-2.5 space-y-1.5 max-h-[280px] overflow-y-auto">
                {allTypes.map((type) => {
                  const color = TYPE_COLORS[type] ?? theme.defaultColor;
                  const visible = visibleTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => handleToggleType(type)}
                      className={`cursor-pointer flex items-center gap-2 w-full text-left transition-opacity ${
                        visible ? 'opacity-100' : 'opacity-30'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] text-text-secondary capitalize">
                        {type.replace(/_/g, ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Node size */}
            <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-2.5">
              <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">
                Node size
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={nodeSize}
                onChange={(e) => setNodeSize(parseFloat(e.target.value))}
                className={sliderClassName}
              />
            </div>

            {/* Zoom + layout controls */}
            <div className="bg-surface/80 backdrop-blur-sm border border-nativz-border rounded-lg p-1 flex flex-col gap-0.5">
              <button
                onClick={handleZoomIn}
                className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Zoom in"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={handleZoomOut}
                className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Zoom out"
              >
                <Minus size={14} />
              </button>
              <div className="h-px bg-nativz-border mx-1" />
              <button
                onClick={handleFitToView}
                className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Fit to view"
              >
                <Maximize2 size={14} />
              </button>
              <div className="h-px bg-nativz-border mx-1" />
              <button
                onClick={handleToggleLayout}
                className={`cursor-pointer p-1.5 rounded-md transition-colors ${
                  layoutRunning
                    ? 'text-accent-text bg-accent-surface/30 hover:bg-accent-surface/50'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                }`}
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
