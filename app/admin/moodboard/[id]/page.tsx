'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeTypes,
  type OnNodesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowLeft,
  Plus,
  StickyNote,
  Map,
  Loader2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddItemModal } from '@/components/moodboard/add-item-modal';
import { VideoAnalysisPanel } from '@/components/moodboard/video-analysis-panel';
import { ReplicationBriefModal } from '@/components/moodboard/replication-brief-modal';
import { VideoNode } from '@/components/moodboard/nodes/video-node';
import { ImageNode } from '@/components/moodboard/nodes/image-node';
import { WebsiteNode } from '@/components/moodboard/nodes/website-node';
import { StickyNode } from '@/components/moodboard/nodes/sticky-node';
import { toast } from 'sonner';
import type { MoodboardBoard, MoodboardItem, MoodboardNote, StickyNoteColor } from '@/lib/types/moodboard';

const nodeTypes: NodeTypes = {
  videoNode: VideoNode,
  imageNode: ImageNode,
  websiteNode: WebsiteNode,
  stickyNode: StickyNode,
};

export default function MoodboardCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [board, setBoard] = useState<MoodboardBoard | null>(null);
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [notes, setNotes] = useState<MoodboardNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Analysis panel
  const [analysisItem, setAnalysisItem] = useState<MoodboardItem | null>(null);
  const [replicateItem, setReplicateItem] = useState<MoodboardItem | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, , onEdgesChange] = useEdgesState([]);

  const positionSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Fetch board data
  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/moodboard/boards/${boardId}`);
      if (!res.ok) {
        toast.error('Board not found');
        router.push('/admin/moodboard');
        return;
      }
      const data = await res.json();
      setBoard(data);
      setItems(data.items ?? []);
      setNotes(data.notes ?? []);
      setNameInput(data.name);
    } catch {
      toast.error('Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [boardId, router]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Convert items + notes to React Flow nodes
  useEffect(() => {
    const itemNodes: Node[] = items.map((item) => ({
      id: `item-${item.id}`,
      type: item.type === 'video' ? 'videoNode' : item.type === 'image' ? 'imageNode' : 'websiteNode',
      position: { x: item.position_x, y: item.position_y },
      data: {
        item,
        onViewAnalysis: (i: MoodboardItem) => setAnalysisItem(i),
        onReplicate: (i: MoodboardItem) => setReplicateItem(i),
        onDelete: handleDeleteItem,
        onExtractInsights: handleExtractInsights,
      },
      style: { width: item.width },
    }));

    const noteNodes: Node[] = notes.map((note) => ({
      id: `note-${note.id}`,
      type: 'stickyNode',
      position: { x: note.position_x, y: note.position_y },
      data: {
        note,
        onUpdate: handleUpdateNote,
        onDelete: handleDeleteNote,
        onColorChange: handleNoteColorChange,
      },
      style: { width: note.width },
    }));

    setNodes([...itemNodes, ...noteNodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, notes]);

  // Save positions on drag (debounced)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleNodesChangeWithSave: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    // Check for position changes
    const hasDrag = changes.some((c) => c.type === 'position' && c.dragging === false);
    if (hasDrag) {
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
      positionSaveTimer.current = setTimeout(() => savePositions(), 500);
    }
  }, [onNodesChange]);

  async function savePositions() {
    const currentNodes = nodes;
    const itemPositions = currentNodes
      .filter((n) => n.id.startsWith('item-'))
      .map((n) => ({
        id: n.id.replace('item-', ''),
        position_x: n.position.x,
        position_y: n.position.y,
        width: n.style?.width as number | undefined,
      }));

    const notePositions = currentNodes
      .filter((n) => n.id.startsWith('note-'))
      .map((n) => ({
        id: n.id.replace('note-', ''),
        position_x: n.position.x,
        position_y: n.position.y,
        width: n.style?.width as number | undefined,
      }));

    try {
      await fetch(`/api/moodboard/boards/${boardId}/positions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemPositions, notes: notePositions }),
      });
    } catch {
      // Silent fail — positions will resync on next load
    }
  }

  // Item CRUD
  async function handleDeleteItem(id: string) {
    try {
      await fetch(`/api/moodboard/items/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Item removed');
    } catch {
      toast.error('Failed to remove item');
    }
  }

  async function handleExtractInsights(item: MoodboardItem) {
    toast.info('Extracting insights...');
    try {
      const res = await fetch(`/api/moodboard/items/${item.id}/insights`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      toast.success('Insights extracted');
    } catch {
      toast.error('Failed to extract insights');
    }
  }

  // Note CRUD
  async function handleAddNote() {
    try {
      const res = await fetch('/api/moodboard/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          position_x: 200 + Math.random() * 300,
          position_y: 200 + Math.random() * 200,
        }),
      });
      if (!res.ok) throw new Error();
      const note = await res.json();
      setNotes((prev) => [...prev, note]);
    } catch {
      toast.error('Failed to add sticky note');
    }
  }

  async function handleUpdateNote(id: string, content: string) {
    try {
      await fetch(`/api/moodboard/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch {
      toast.error('Failed to update note');
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await fetch(`/api/moodboard/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error('Failed to delete note');
    }
  }

  async function handleNoteColorChange(id: string, color: StickyNoteColor) {
    try {
      await fetch(`/api/moodboard/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      });
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
    } catch {
      toast.error('Failed to change color');
    }
  }

  // Board name editing
  async function handleSaveName() {
    if (!nameInput.trim() || nameInput === board?.name) {
      setEditingName(false);
      return;
    }
    try {
      await fetch(`/api/moodboard/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setBoard((prev) => prev ? { ...prev, name: nameInput.trim() } : prev);
      setEditingName(false);
    } catch {
      toast.error('Failed to rename board');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Canvas header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-nativz-border bg-surface">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/moodboard')}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={18} />
          </button>

          {editingName ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(board?.name ?? ''); } }}
                className="h-8 text-sm w-48"
                autoFocus
              />
              <button onClick={handleSaveName} className="cursor-pointer rounded p-1 text-accent-text hover:bg-accent-surface"><Check size={14} /></button>
              <button onClick={() => { setEditingName(false); setNameInput(board?.name ?? ''); }} className="cursor-pointer rounded p-1 text-text-muted hover:bg-surface-hover"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="cursor-pointer flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-accent-text transition-colors group"
            >
              {board?.name ?? 'Untitled board'}
              <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {board?.client_name && (
            <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[10px] font-medium text-accent-text">
              {board.client_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleAddNote}>
            <StickyNote size={14} />
            Add note
          </Button>
          <GlassButton onClick={() => setAddItemOpen(true)}>
            <Plus size={14} />
            Add item
          </GlassButton>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChangeWithSave}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background color="rgba(255,255,255,0.03)" gap={20} />
          <Controls
            className="!bg-surface !border-nativz-border !rounded-lg !shadow-card [&>button]:!bg-surface [&>button]:!border-nativz-border [&>button]:!text-text-muted [&>button:hover]:!bg-surface-hover"
            position="bottom-left"
          />
          {showMinimap && (
            <MiniMap
              className="!bg-surface !border-nativz-border !rounded-lg"
              nodeColor="rgba(43, 125, 233, 0.3)"
              maskColor="rgba(0,0,0,0.5)"
            />
          )}
        </ReactFlow>

        {/* Minimap toggle */}
        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className={`cursor-pointer absolute bottom-4 right-4 rounded-lg p-2 border transition-colors ${
            showMinimap
              ? 'bg-accent-surface border-accent/30 text-accent-text'
              : 'bg-surface border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover'
          }`}
        >
          <Map size={16} />
        </button>
      </div>

      {/* Add Item Modal */}
      <AddItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        boardId={boardId}
        onItemAdded={fetchBoard}
      />

      {/* Video Analysis Panel */}
      {analysisItem && (
        <VideoAnalysisPanel
          item={analysisItem}
          onClose={() => setAnalysisItem(null)}
          onReplicate={(item) => { setAnalysisItem(null); setReplicateItem(item); }}
        />
      )}

      {/* Replication Brief Modal */}
      {replicateItem && (
        <ReplicationBriefModal
          item={replicateItem}
          clientId={board?.client_id ?? null}
          onClose={() => setReplicateItem(null)}
          onSaved={(brief) => {
            setItems((prev) => prev.map((i) => (i.id === replicateItem.id ? { ...i, replication_brief: brief } : i)));
            setReplicateItem(null);
          }}
        />
      )}
    </div>
  );
}
