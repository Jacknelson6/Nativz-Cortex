'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, Lock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SharedVideoNode } from '@/components/moodboard/nodes/shared-video-node';
import { ImageNode } from '@/components/moodboard/nodes/image-node';
import { WebsiteNode } from '@/components/moodboard/nodes/website-node';
import { StickyNode } from '@/components/moodboard/nodes/sticky-node';
import { LabeledEdge } from '@/components/moodboard/edges/labeled-edge';
import { SharedAnalysisPanel } from '@/components/moodboard/shared-analysis-panel';
import type { MoodboardItem, MoodboardNote, MoodboardEdge } from '@/lib/types/moodboard';

const nodeTypes: NodeTypes = {
  videoNode: SharedVideoNode,
  imageNode: ImageNode,
  websiteNode: WebsiteNode,
  stickyNode: StickyNode,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

interface BoardData {
  board: {
    id: string;
    name: string;
    description: string | null;
    client_name: string | null;
  };
  items: MoodboardItem[];
  notes: MoodboardNote[];
  edges: MoodboardEdge[];
}

function SharedMoodboardCanvas() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [analysisItem, setAnalysisItem] = useState<MoodboardItem | null>(null);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  const fetchBoard = useCallback(async (pwd?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/shared/moodboard/${token}`, window.location.origin);
      if (pwd) url.searchParams.set('password', pwd);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (!res.ok) {
        if (data.passwordRequired) {
          setPasswordRequired(true);
          if (pwd) setError('Invalid password');
          setLoading(false);
          return;
        }
        setError(data.error || 'Failed to load board');
        setLoading(false);
        return;
      }

      setPasswordRequired(false);
      setBoardData(data);
    } catch {
      setError('Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Convert to React Flow nodes
  useEffect(() => {
    if (!boardData) return;

    const itemNodes: Node[] = boardData.items.map((item) => ({
      id: `item-${item.id}`,
      type: item.type === 'video' ? 'videoNode' : item.type === 'image' ? 'imageNode' : 'websiteNode',
      position: { x: item.position_x, y: item.position_y },
      data: {
        item,
        onViewAnalysis: (i: MoodboardItem) => setAnalysisItem(i),
        onReplicate: () => {},
        onRescript: () => {},
        onDelete: () => {},
        onExtractInsights: () => {},
      },
      style: { width: item.width },
      draggable: false,
      selectable: false,
      connectable: false,
    }));

    const noteNodes: Node[] = boardData.notes.map((note) => ({
      id: `note-${note.id}`,
      type: 'stickyNode',
      position: { x: note.position_x, y: note.position_y },
      data: {
        note,
        onUpdate: () => {},
        onDelete: () => {},
        onColorChange: () => {},
      },
      style: { width: note.width },
      draggable: false,
      selectable: false,
      connectable: false,
    }));

    setNodes([...itemNodes, ...noteNodes]);

    const flowEdges: Edge[] = boardData.edges.map((e) => ({
      id: `edge-${e.id}`,
      source: e.source_node_id,
      target: e.target_node_id,
      type: 'labeled',
      data: {
        label: e.label,
        style: e.style,
        color: e.color,
        dbId: e.id,
        onDelete: () => {},
        onUpdate: () => {},
      },
      selectable: false,
    }));
    setEdges(flowEdges);
  }, [boardData, setNodes, setEdges]);

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === 'videoNode') return '#3b82f6';
    if (node.type === 'imageNode') return '#22c55e';
    if (node.type === 'websiteNode') return '#a855f7';
    if (node.type === 'stickyNode') return '#eab308';
    return '#888888';
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-6">
          <div className="rounded-2xl bg-surface border border-nativz-border p-4 shadow-elevated">
            <Lock size={28} className="text-text-muted" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary">This board is password protected</h1>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <form
            onSubmit={(e) => { e.preventDefault(); fetchBoard(password); }}
            className="flex flex-col gap-3 w-full"
          >
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!password}>
              <Eye size={14} />
              View Board
            </Button>
          </form>
          <p className="text-xs text-text-muted">Shared via Nativz Cortex</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-2">{error}</p>
          <p className="text-xs text-text-muted">This share link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }

  if (!boardData) return null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-accent-text">Nativz</span>
          <span className="text-nativz-border">|</span>
          <h1 className="text-sm font-semibold text-text-primary">{boardData.board.name}</h1>
          {boardData.board.client_name && (
            <span className="rounded-full bg-accent-surface px-2.5 py-0.5 text-[10px] font-medium text-accent-text">
              {boardData.board.client_name}
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-muted">Shared by Nativz · Read-only</span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(255,255,255,0.12)"
            gap={20}
            size={1}
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            className="!bg-surface !border-nativz-border !rounded-lg"
            nodeColor={minimapNodeColor}
            maskColor="rgba(0,0,0,0.5)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {/* Analysis Panel (read-only) */}
      {analysisItem && (
        <SharedAnalysisPanel
          item={analysisItem}
          onClose={() => setAnalysisItem(null)}
        />
      )}
    </div>
  );
}

export default function SharedMoodboardPage() {
  return (
    <ReactFlowProvider>
      <SharedMoodboardCanvas />
    </ReactFlowProvider>
  );
}
