'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { KnowledgeGraphData } from '@/lib/knowledge/types';
import { GraphControls } from './GraphControls';

// ── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  entryId?: string;
  connectionCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

// ── Colors ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  brand_profile: '#f59e0b',
  web_page: '#38bdf8',
  note: '#a78bfa',
  document: '#a78bfa',
  idea: '#f472b6',
  idea_submission: '#f472b6',
  brand_asset: '#f59e0b',
  contact: '#fb923c',
  search: '#2dd4bf',
  strategy: '#f59e0b',
  meeting_note: '#2dd4bf',
};

const DEFAULT_COLOR = '#64748b';

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ── Build graph data ─────────────────────────────────────────────────────────

function buildGraphData(data: KnowledgeGraphData): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entry of data.entries) {
    nodes.push({
      id: `entry-${entry.id}`,
      label: entry.title,
      type: entry.type,
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      vx: 0,
      vy: 0,
      entryId: entry.id,
      connectionCount: 0,
    });
  }

  for (const ext of data.externalNodes) {
    nodes.push({
      id: `${ext.type}-${ext.id}`,
      label: ext.title,
      type: ext.type,
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      vx: 0,
      vy: 0,
      connectionCount: 0,
    });
  }

  const seenEdges = new Set<string>();
  for (const link of data.links) {
    const sourceId = link.source_type === 'entry' ? `entry-${link.source_id}` : `${link.source_type}-${link.source_id}`;
    const targetId = link.target_type === 'entry' ? `entry-${link.target_id}` : `${link.target_type}-${link.target_id}`;
    // Deduplicate bidirectional edges — only keep one per pair
    const edgeKey = [sourceId, targetId].sort().join('::');
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({ source: sourceId, target: targetId, label: link.label ?? undefined });
  }

  // Count connections
  const connectionCounts = new Map<string, number>();
  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.connectionCount = connectionCounts.get(node.id) ?? 0;
  }

  return { nodes, edges };
}

// ── Component ────────────────────────────────────────────────────────────────

interface KnowledgeGraphProps {
  data: KnowledgeGraphData;
  onNodeContextMenu?: (entryId: string, x: number, y: number) => void;
  selectedNodeId?: string | null;
  hoveredEntryId?: string | null;
  searchQuery?: string;
}

export function KnowledgeGraph({ data, onNodeContextMenu, selectedNodeId, hoveredEntryId, searchQuery }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const hoveredRef = useRef<string | null>(null);
  const externalHoveredRef = useRef<string | null>(null);
  const alphaRef = useRef(1);
  const frameRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const isPanningRef = useRef(false);
  const draggingNodeRef = useRef<GraphNode | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const adjacencyRef = useRef(new Map<string, Set<string>>());
  const initialFitDone = useRef(false);

  const [, setRenderTick] = useState(0);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());

  // All types present in the graph
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of data.entries) types.add(entry.type);
    for (const ext of data.externalNodes) types.add(ext.type);
    return Array.from(types).sort();
  }, [data]);

  // Initialize visible types
  useEffect(() => {
    setVisibleTypes(new Set(allTypes));
  }, [allTypes]);

  // Sync external hover from file explorer
  useEffect(() => {
    externalHoveredRef.current = hoveredEntryId ? `entry-${hoveredEntryId}` : null;
  }, [hoveredEntryId]);

  // Build graph data when data changes
  useEffect(() => {
    const built = buildGraphData(data);
    nodesRef.current = built.nodes;
    edgesRef.current = built.edges;
    alphaRef.current = 1;
    initialFitDone.current = false;

    // Build adjacency map
    const adj = new Map<string, Set<string>>();
    for (const edge of built.edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, new Set());
      if (!adj.has(edge.target)) adj.set(edge.target, new Set());
      adj.get(edge.source)!.add(edge.target);
      adj.get(edge.target)!.add(edge.source);
    }
    adjacencyRef.current = adj;
  }, [data]);

  // Fit to view
  const fitToView = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;

    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    if (w === 0 || h === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }

    const graphW = maxX - minX || 100;
    const graphH = maxY - minY || 100;
    const padding = 80;
    const scaleX = (w - padding * 2) / graphW;
    const scaleY = (h - padding * 2) / graphH;
    const newZoom = Math.min(scaleX, scaleY, 2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    zoomRef.current = newZoom;
    panRef.current = { x: -centerX * newZoom, y: -centerY * newZoom };
  }, []);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      sizeRef.current = { w, h };
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let frameCount = 0;

    function tick() {
      if (!running) return;
      frameCount++;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const alpha = alphaRef.current;

      if (nodes.length === 0) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      // ── Force simulation step ──
      if (alpha > 0.005) {
        const repulsion = 15000 * alpha;
        const springLength = 350;
        const springStrength = 0.0008 * alpha;
        const centerPull = 0.001 * alpha;
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));

        // Repulsion (Coulomb)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) dist = 1;
            const force = repulsion / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }

        // Spring attraction along edges (toward rest length)
        for (const edge of edges) {
          const a = nodeMap.get(edge.source);
          const b = nodeMap.get(edge.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const displacement = dist - springLength;
          const force = displacement * springStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }

        // Center gravity
        for (const node of nodes) {
          node.vx -= node.x * centerPull;
          node.vy -= node.y * centerPull;
        }

        // Apply velocity with heavy damping + NaN guard
        for (const node of nodes) {
          node.vx *= 0.6;
          node.vy *= 0.6;
          node.x += node.vx;
          node.y += node.vy;
          if (!isFinite(node.x)) node.x = (Math.random() - 0.5) * 200;
          if (!isFinite(node.y)) node.y = (Math.random() - 0.5) * 200;
          if (!isFinite(node.vx)) node.vx = 0;
          if (!isFinite(node.vy)) node.vy = 0;
        }

        // Cool down — settle to a gentle ambient drift
        alphaRef.current = alpha * 0.985;
        if (alphaRef.current < 0.008) alphaRef.current = 0.008;
      }

      // Fit to view on first stabilization
      if (!initialFitDone.current && frameCount > 60) {
        fitToView();
        initialFitDone.current = true;
      }

      // ── Render ──
      const dpr = window.devicePixelRatio || 1;
      const w = sizeRef.current.w;
      const h = sizeRef.current.h;
      const zoom = zoomRef.current;
      const pan = panRef.current;
      const hoveredId = hoveredRef.current ?? externalHoveredRef.current;

      ctx!.clearRect(0, 0, w * dpr, h * dpr);
      ctx!.save();
      ctx!.scale(dpr, dpr);
      ctx!.translate(w / 2 + pan.x, h / 2 + pan.y);
      ctx!.scale(zoom, zoom);

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const adj = adjacencyRef.current;
      const hoverNeighbors = hoveredId ? adj.get(hoveredId) ?? new Set() : new Set<string>();
      const isHighlightMode = hoveredId !== null;
      const searchLower = (searchQuery ?? '').toLowerCase();
      const hasSearch = searchLower.length > 0;

      // ── Draw edges ──
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;

        // Type visibility filter
        if (!visibleTypes.has(a.type) || !visibleTypes.has(b.type)) continue;

        const isConnectedToHover =
          hoveredId === a.id || hoveredId === b.id;
        const isDimmed = isHighlightMode && !isConnectedToHover;

        // Edge style by label
        let baseAlpha: number;
        let dashed = false;
        if (edge.label === 'wikilink') {
          baseAlpha = 0.3;
        } else if (edge.label === 'generated_from') {
          baseAlpha = 0.2;
          dashed = true;
        } else {
          baseAlpha = 0.15;
        }

        let edgeAlpha = baseAlpha;

        if (isDimmed) edgeAlpha = 0.03;
        if (isConnectedToHover) edgeAlpha = Math.min(baseAlpha * 2.5, 0.8);

        // Gradient
        const colorA = TYPE_COLORS[a.type] ?? DEFAULT_COLOR;
        const colorB = TYPE_COLORS[b.type] ?? DEFAULT_COLOR;
        const [rA, gA, bA] = hexToRgb(colorA);
        const [rB, gB, bB] = hexToRgb(colorB);

        if (!isFinite(a.x) || !isFinite(a.y) || !isFinite(b.x) || !isFinite(b.y)) continue;
        const grad = ctx!.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `rgba(${rA},${gA},${bA},${edgeAlpha})`);
        grad.addColorStop(1, `rgba(${rB},${gB},${bB},${edgeAlpha})`);

        ctx!.strokeStyle = grad;
        ctx!.lineWidth = isConnectedToHover ? 1.5 : 0.6;

        if (dashed) {
          ctx!.setLineDash([4, 4]);
        } else {
          ctx!.setLineDash([]);
        }

        // Curved bezier
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = Math.min(dist * 0.15, 30);
        const cpX = midX + (-dy / dist) * curvature;
        const cpY = midY + (dx / dist) * curvature;

        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.quadraticCurveTo(cpX, cpY, b.x, b.y);
        ctx!.stroke();
      }

      ctx!.setLineDash([]);

      // ── Draw nodes ──
      for (const node of nodes) {
        // Type visibility filter
        if (!visibleTypes.has(node.type)) continue;

        const color = TYPE_COLORS[node.type] ?? DEFAULT_COLOR;
        const [r, g, b] = hexToRgb(color);
        const isHovered = hoveredId === node.id;
        const isSelected = selectedNodeId ? `entry-${selectedNodeId}` === node.id : false;
        const isNeighbor = hoveredId ? hoverNeighbors.has(node.id) : false;
        const isSearchMatch = hasSearch && node.label.toLowerCase().includes(searchLower);
        const isDimmed = isHighlightMode && !isHovered && !isNeighbor;

        const baseRadius = 3 + Math.sqrt(node.connectionCount) * 1.5;
        let drawRadius = baseRadius;
        if (isHovered) drawRadius = baseRadius + 3;
        if (isSelected) drawRadius = baseRadius + 2;
        if (isSearchMatch) drawRadius = baseRadius + 1.5;

        let nodeAlpha = isDimmed ? 0.1 : 1;

        // Glow
        if (isHovered || isSelected || isSearchMatch) {
          ctx!.shadowBlur = isHovered ? 16 : 10;
          ctx!.shadowColor = color;
        }

        ctx!.fillStyle = `rgba(${r},${g},${b},${nodeAlpha})`;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, drawRadius, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.shadowBlur = 0;

        // Label
        const showLabel = isHovered || isSelected || isSearchMatch;
        if (showLabel && !isDimmed) {
          ctx!.font = '10px system-ui, sans-serif';
          ctx!.textAlign = 'center';
          // Text shadow for readability
          ctx!.fillStyle = 'rgba(0,0,0,0.6)';
          ctx!.fillText(node.label.slice(0, 40), node.x + 0.5, node.y - drawRadius - 5.5);
          ctx!.fillStyle = `rgba(255,255,255,${isDimmed ? 0.1 : 0.9})`;
          ctx!.fillText(node.label.slice(0, 40), node.x, node.y - drawRadius - 6);
        }
      }

      ctx!.restore();
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [data, selectedNodeId, searchQuery, visibleTypes, fitToView]);

  // ── Mouse interactions ──

  const findNodeAt = useCallback((cx: number, cy: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const gx = (cx - rect.left - w / 2 - pan.x) / zoom;
    const gy = (cy - rect.top - h / 2 - pan.y) / zoom;

    let closest: GraphNode | null = null;
    let closestDist = 15 / zoom;

    for (const node of nodesRef.current) {
      if (!visibleTypes.has(node.type)) continue;
      const dx = node.x - gx;
      const dy = node.y - gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }
    return closest;
  }, [visibleTypes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Dragging a node
    if (draggingNodeRef.current) {
      const zoom = zoomRef.current;
      const dx = (e.clientX - lastMouseRef.current.x) / zoom;
      const dy = (e.clientY - lastMouseRef.current.y) / zoom;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      draggingNodeRef.current.x += dx;
      draggingNodeRef.current.y += dy;
      draggingNodeRef.current.vx = 0;
      draggingNodeRef.current.vy = 0;
      return;
    }
    if (isPanningRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      panRef.current = {
        x: panRef.current.x + dx,
        y: panRef.current.y + dy,
      };
      return;
    }
    const node = findNodeAt(e.clientX, e.clientY);
    hoveredRef.current = node?.id ?? null;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    }
  }, [findNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only handle left click
    const node = findNodeAt(e.clientX, e.clientY);
    if (node) {
      // Start dragging the node
      draggingNodeRef.current = node;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }
    isPanningRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, [findNodeAt]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const node = findNodeAt(e.clientX, e.clientY);
    if (node && node.entryId && onNodeContextMenu) {
      e.preventDefault();
      onNodeContextMenu(node.entryId, e.clientX, e.clientY);
    }
  }, [findNodeAt, onNodeContextMenu]);

  const handleMouseUp = useCallback(() => {
    draggingNodeRef.current = null;
    isPanningRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    zoomRef.current = Math.max(0.1, Math.min(5, zoomRef.current * factor));
  }, []);

  const handleDoubleClick = useCallback(() => {
    fitToView();
  }, [fitToView]);

  const handleToggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const isEmpty = data.entries.length === 0 && data.externalNodes.length === 0;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#0d0f1a]">
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
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            className="block w-full h-full"
            style={{ cursor: 'grab' }}
          />
          <GraphControls
            onZoomIn={() => {
              zoomRef.current = Math.min(5, zoomRef.current * 1.2);
            }}
            onZoomOut={() => {
              zoomRef.current = Math.max(0.1, zoomRef.current * 0.8);
            }}
            onFit={fitToView}
            visibleTypes={visibleTypes}
            allTypes={allTypes}
            onToggleType={handleToggleType}
          />
        </>
      )}
    </div>
  );
}
