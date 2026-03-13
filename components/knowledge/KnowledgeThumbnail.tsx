'use client';

import { useRef, useEffect, useState } from 'react';

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
};

const DEFAULT_COLOR = '#64748b';

interface KnowledgeThumbnailProps {
  nodes: { type: string }[];
}

// Simple seeded RNG for deterministic layouts
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function KnowledgeThumbnail({ nodes }: KnowledgeThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const w = container!.clientWidth;
      setSize({ w, h: 180 });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0 || size.w === 0) return;

    const { w, h } = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const rand = seededRandom(nodes.length * 42 + 7);

    // ── Place nodes using force-relaxed positions ──────────────────────
    const padX = 30;
    const padY = 24;
    const positions: { x: number; y: number; type: string; radius: number }[] = [];

    // Initial placement: concentric clusters with randomness
    for (let i = 0; i < nodes.length; i++) {
      const golden = 2.399963;
      const angle = i * golden + rand() * 0.6;
      const spread = Math.sqrt((i + 1) / nodes.length);
      const rx = (w / 2 - padX) * spread * 0.85;
      const ry = (h / 2 - padY) * spread * 0.85;
      const type = nodes[i].type;
      const isBig = type === 'brand_profile' || type === 'strategy';
      const radius = isBig ? 4.5 : 2 + rand() * 1.5;

      positions.push({
        x: cx + Math.cos(angle) * rx * (0.5 + rand() * 0.5),
        y: cy + Math.sin(angle) * ry * (0.5 + rand() * 0.5),
        type,
        radius,
      });
    }

    // Simple repulsion pass to avoid overlaps
    for (let iter = 0; iter < 30; iter++) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = (a.radius + b.radius) * 4;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.15;
            dx = (dx / dist) * force;
            dy = (dy / dist) * force;
            a.x += dx;
            a.y += dy;
            b.x -= dx;
            b.y -= dy;
          }
        }
        // Keep in bounds
        const p = positions[i];
        p.x = Math.max(padX, Math.min(w - padX, p.x));
        p.y = Math.max(padY, Math.min(h - padY, p.y));
      }
    }

    // ── Build edges: connect nearby nodes with some randomness ────────
    const edges: [number, number][] = [];
    for (let i = 0; i < positions.length; i++) {
      // Connect to 1-3 nearest neighbors
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < positions.length; j++) {
        if (i === j) continue;
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        dists.push({ j, d: Math.sqrt(dx * dx + dy * dy) });
      }
      dists.sort((a, b) => a.d - b.d);
      const count = Math.min(1 + Math.floor(rand() * 2.5), dists.length);
      for (let k = 0; k < count; k++) {
        const j = dists[k].j;
        if (dists[k].d > Math.min(w, h) * 0.5) continue;
        // Avoid duplicate edges
        if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) {
          edges.push([i, j]);
        }
      }
    }

    // ── Draw background gradient ──────────────────────────────────────
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
    bgGrad.addColorStop(0, 'rgba(56, 189, 248, 0.04)');
    bgGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // ── Draw edges with curves ────────────────────────────────────────
    for (const [i, j] of edges) {
      const a = positions[i];
      const b = positions[j];
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

      // Gradient along edge
      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const colA = TYPE_COLORS[a.type] ?? DEFAULT_COLOR;
      const colB = TYPE_COLORS[b.type] ?? DEFAULT_COLOR;
      grad.addColorStop(0, colA);
      grad.addColorStop(1, colB);

      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.08 + 0.06 * (1 - dist / (Math.max(w, h) * 0.5));
      ctx.lineWidth = 0.8;

      // Slight curve via midpoint offset
      const mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.1;
      const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.1;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }

    // ── Draw nodes ────────────────────────────────────────────────────
    ctx.globalAlpha = 1;
    for (const pos of positions) {
      const color = TYPE_COLORS[pos.type] ?? DEFAULT_COLOR;

      // Outer glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.radius + 2, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
  }, [nodes, size]);

  if (nodes.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg"
        style={{ height: 180 }}
      />
    </div>
  );
}
