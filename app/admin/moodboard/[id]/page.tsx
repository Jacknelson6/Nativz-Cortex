'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type Connection,
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
  Clipboard,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddItemModal } from '@/components/moodboard/add-item-modal';
import { VideoAnalysisPanel } from '@/components/moodboard/video-analysis-panel';
import { ReplicationBriefModal } from '@/components/moodboard/replication-brief-modal';
import { ShareBoardModal } from '@/components/moodboard/share-board-modal';
import { VideoNode } from '@/components/moodboard/nodes/video-node';
import { ImageNode } from '@/components/moodboard/nodes/image-node';
import { WebsiteNode } from '@/components/moodboard/nodes/website-node';
import { StickyNode } from '@/components/moodboard/nodes/sticky-node';
import { LabeledEdge } from '@/components/moodboard/edges/labeled-edge';
import { SelectionToolbar } from '@/components/moodboard/toolbar/selection-toolbar';
import { FilterBar, type MoodboardFilters } from '@/components/moodboard/filter-bar';
import { useMoodboardShortcuts } from '@/components/moodboard/hooks/use-moodboard-shortcuts';
import { toast } from 'sonner';
import { detectLinkType, linkTypeToItemType } from '@/lib/types/moodboard';
import type { MoodboardBoard, MoodboardItem, MoodboardNote, MoodboardEdge, MoodboardTag, StickyNoteColor } from '@/lib/types/moodboard';

const nodeTypes: NodeTypes = {
  videoNode: VideoNode,
  imageNode: ImageNode,
  websiteNode: WebsiteNode,
  stickyNode: StickyNode,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

// Undo history entry
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

function MoodboardCanvas() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;
  const reactFlowInstance = useReactFlow();

  const [board, setBoard] = useState<MoodboardBoard | null>(null);
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [notes, setNotes] = useState<MoodboardNote[]>([]);
  const [dbEdges, setDbEdges] = useState<MoodboardEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [pasting, setPasting] = useState(false);

  // Analysis panel
  const [analysisItem, setAnalysisItem] = useState<MoodboardItem | null>(null);
  const [replicateItem, setReplicateItem] = useState<MoodboardItem | null>(null);

  // Tags & filters
  const [boardTags, setBoardTags] = useState<MoodboardTag[]>([]);
  const [itemTagsMap, setItemTagsMap] = useState<Record<string, MoodboardTag[]>>({});
  const [filters, setFilters] = useState<MoodboardFilters>({ platform: 'all', status: 'all', tagIds: [], searchQuery: '' });
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Undo history
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);

  const positionSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Track selected nodes
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);

  // Push to undo history
  const pushHistory = useCallback(() => {
    const entry: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    historyIndexRef.current++;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current);
    historyRef.current.push(entry);
    // Keep max 30 entries
    if (historyRef.current.length > 30) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
  }, [nodes, edges]);

  // Fetch board data
  const fetchBoard = useCallback(async () => {
    try {
      const [boardRes, edgesRes] = await Promise.all([
        fetch(`/api/moodboard/boards/${boardId}`),
        fetch(`/api/moodboard/edges?board_id=${boardId}`),
      ]);

      if (!boardRes.ok) {
        toast.error('Board not found');
        router.push('/admin/moodboard');
        return;
      }
      const data = await boardRes.json();
      setBoard(data);
      setItems(data.items ?? []);
      setNotes(data.notes ?? []);
      setNameInput(data.name);

      if (edgesRes.ok) {
        const edgesData = await edgesRes.json();
        setDbEdges(edgesData);
      }
    } catch {
      toast.error('Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [boardId, router]);

  // Fetch board tags
  const fetchBoardTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/moodboard/boards/${boardId}/tags`);
      if (res.ok) setBoardTags(await res.json());
    } catch { /* ignore */ }
  }, [boardId]);

  // Fetch item tags for all items
  const fetchAllItemTags = useCallback(async (itemList: MoodboardItem[]) => {
    const map: Record<string, MoodboardTag[]> = {};
    await Promise.all(
      itemList.map(async (item) => {
        try {
          const res = await fetch(`/api/moodboard/items/${item.id}/tags`);
          if (res.ok) map[item.id] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setItemTagsMap(map);
  }, []);

  useEffect(() => {
    fetchBoard();
    fetchBoardTags();
  }, [fetchBoard, fetchBoardTags]);

  // Fetch item tags when items change
  useEffect(() => {
    if (items.length > 0) fetchAllItemTags(items);
  }, [items, fetchAllItemTags]);

  // Search effect
  useEffect(() => {
    if (!filters.searchQuery) {
      setSearchMatchIds(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/moodboard/boards/${boardId}/search?q=${encodeURIComponent(filters.searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchMatchIds(new Set(data.item_ids));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.searchQuery, boardId]);

  // Edge handlers
  const handleDeleteEdge = useCallback(async (dbId: string) => {
    try {
      await fetch(`/api/moodboard/edges/${dbId}`, { method: 'DELETE' });
      setDbEdges((prev) => prev.filter((e) => e.id !== dbId));
      setEdges((prev) => prev.filter((e) => e.data?.dbId !== dbId));
    } catch {
      toast.error('Failed to delete connection');
    }
  }, [setEdges]);

  const handleUpdateEdge = useCallback(async (dbId: string, data: { label?: string | null; style?: string; color?: string }) => {
    try {
      const res = await fetch(`/api/moodboard/edges/${dbId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDbEdges((prev) => prev.map((e) => (e.id === dbId ? updated : e)));
      setEdges((prev) => prev.map((e) =>
        e.data?.dbId === dbId
          ? { ...e, data: { ...e.data, ...data, dbId } }
          : e
      ));
    } catch {
      toast.error('Failed to update connection');
    }
  }, [setEdges]);

  // Determine if an item passes filters
  const itemPassesFilter = useCallback((item: MoodboardItem): boolean => {
    if (filters.platform !== 'all' && item.platform !== filters.platform) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.tagIds.length > 0) {
      const tags = itemTagsMap[item.id] || [];
      const tagIds = new Set(tags.map((t) => t.id));
      if (!filters.tagIds.some((id) => tagIds.has(id))) return false;
    }
    if (searchMatchIds !== null && !searchMatchIds.has(item.id)) return false;
    return true;
  }, [filters, itemTagsMap, searchMatchIds]);

  // Convert items + notes to React Flow nodes
  useEffect(() => {
    const itemNodes: Node[] = items.map((item) => ({
      id: `item-${item.id}`,
      type: item.type === 'video' ? 'videoNode' : item.type === 'image' ? 'imageNode' : 'websiteNode',
      position: { x: item.position_x, y: item.position_y },
      hidden: !itemPassesFilter(item),
      data: {
        item,
        onViewAnalysis: (i: MoodboardItem) => setAnalysisItem(i),
        onReplicate: (i: MoodboardItem) => setReplicateItem(i),
        onDelete: handleDeleteItem,
        onExtractInsights: handleExtractInsights,
      },
      style: { width: item.width || (item.platform === 'tiktok' || item.platform === 'instagram' ? 220 : 320) },
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

  // Convert db edges to React Flow edges
  useEffect(() => {
    const flowEdges: Edge[] = dbEdges.map((e) => ({
      id: `edge-${e.id}`,
      source: e.source_node_id,
      target: e.target_node_id,
      type: 'labeled',
      data: {
        label: e.label,
        style: e.style,
        color: e.color,
        dbId: e.id,
        onDelete: handleDeleteEdge,
        onUpdate: handleUpdateEdge,
      },
    }));
    setEdges(flowEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEdges, handleDeleteEdge, handleUpdateEdge]);

  // Handle new edge connection
  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;

    try {
      const res = await fetch('/api/moodboard/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          source_node_id: connection.source,
          target_node_id: connection.target,
        }),
      });

      if (!res.ok) throw new Error();
      const newEdge = await res.json();
      setDbEdges((prev) => [...prev, newEdge]);
      toast.success('Connection created');
    } catch {
      toast.error('Failed to create connection');
    }
  }, [boardId]);

  // Multi-URL paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;

      // Check for multiple URLs
      const urls = text.split(/[\n\s]+/).filter((s) => {
        try { new URL(s); return true; } catch { return false; }
      });

      if (urls.length === 0) return;

      e.preventDefault();

      if (urls.length === 1) {
        addItemFromPaste(urls[0]);
      } else {
        addMultipleItems(urls);
      }
    }

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, pasting]);

  async function addItemFromPaste(url: string) {
    if (pasting) return;
    setPasting(true);

    const canvasCenter = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const linkType = detectLinkType(url);
    const itemType = linkTypeToItemType(linkType);

    toast.info(`Adding ${itemType}...`, { duration: 2000 });

    try {
      const res = await fetch('/api/moodboard/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          url,
          type: itemType,
          position_x: canvasCenter.x - 160 + (Math.random() * 60 - 30),
          position_y: canvasCenter.y - 140 + (Math.random() * 60 - 30),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add item');
      }

      toast.success('Item added to board');
      fetchBoard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setPasting(false);
    }
  }

  async function addMultipleItems(urls: string[]) {
    if (pasting) return;
    setPasting(true);

    const canvasCenter = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const cols = Math.ceil(Math.sqrt(urls.length));
    const spacing = 360;

    toast.info(`Adding ${urls.length} items...`, { duration: 3000 });

    let added = 0;
    for (let i = 0; i < urls.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const linkType = detectLinkType(urls[i]);
      const itemType = linkTypeToItemType(linkType);

      try {
        const res = await fetch('/api/moodboard/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            board_id: boardId,
            url: urls[i],
            type: itemType,
            position_x: canvasCenter.x + col * spacing - ((cols - 1) * spacing) / 2,
            position_y: canvasCenter.y + row * spacing - spacing,
          }),
        });
        if (res.ok) added++;
      } catch {
        // continue with next
      }
    }

    toast.success(`Added ${added} of ${urls.length} items`);
    fetchBoard();
    setPasting(false);
  }

  // Save positions on drag (debounced)
  const handleNodesChangeWithSave: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    const hasDrag = changes.some((c) => c.type === 'position' && c.dragging === false);
    if (hasDrag) {
      pushHistory();
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
      positionSaveTimer.current = setTimeout(() => savePositions(), 500);
    }
  }, [onNodesChange, pushHistory]);

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
      // Silent fail
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
    const canvasCenter = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    try {
      const res = await fetch('/api/moodboard/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          position_x: canvasCenter.x - 80 + Math.random() * 60,
          position_y: canvasCenter.y - 60 + Math.random() * 40,
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

  // Alignment toolbar handler
  const handleAlignmentUpdate = useCallback((updates: Array<{ id: string; x: number; y: number }>) => {
    pushHistory();
    setNodes((nds) =>
      nds.map((n) => {
        const update = updates.find((u) => u.id === n.id);
        if (update) {
          return { ...n, position: { x: update.x, y: update.y } };
        }
        return n;
      })
    );
    // Save after alignment
    if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
    positionSaveTimer.current = setTimeout(() => savePositions(), 500);
  }, [setNodes, pushHistory]);

  // Keyboard shortcut handlers
  const handleDeleteSelected = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;

    const confirmed = window.confirm(`Delete ${selected.length} selected item(s)?`);
    if (!confirmed) return;

    pushHistory();
    for (const node of selected) {
      if (node.id.startsWith('item-')) {
        handleDeleteItem(node.id.replace('item-', ''));
      } else if (node.id.startsWith('note-')) {
        handleDeleteNote(node.id.replace('note-', ''));
      }
    }

    // Also delete selected edges
    const selectedEdges = edges.filter((e) => e.selected);
    for (const edge of selectedEdges) {
      if (edge.data?.dbId) {
        handleDeleteEdge(edge.data.dbId);
      }
    }
  }, [nodes, edges, pushHistory, handleDeleteEdge]);

  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, [setNodes, setEdges]);

  const handleDeselectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setNodes, setEdges]);

  const handleDuplicateSelected = useCallback(async () => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;

    for (const node of selected) {
      if (node.id.startsWith('item-')) {
        const item = items.find((i) => `item-${i.id}` === node.id);
        if (item) {
          try {
            await fetch('/api/moodboard/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                board_id: boardId,
                url: item.url,
                type: item.type,
                position_x: node.position.x + 40,
                position_y: node.position.y + 40,
              }),
            });
          } catch { /* continue */ }
        }
      } else if (node.id.startsWith('note-')) {
        const note = notes.find((n) => `note-${n.id}` === node.id);
        if (note) {
          try {
            const res = await fetch('/api/moodboard/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                board_id: boardId,
                content: note.content,
                color: note.color,
                position_x: node.position.x + 40,
                position_y: node.position.y + 40,
              }),
            });
            if (res.ok) {
              const newNote = await res.json();
              setNotes((prev) => [...prev, newNote]);
            }
          } catch { /* continue */ }
        }
      }
    }

    toast.success(`Duplicated ${selected.length} item(s)`);
    fetchBoard();
  }, [nodes, items, notes, boardId, fetchBoard]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      toast.info('Nothing to undo');
      return;
    }
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    if (entry) {
      setNodes(entry.nodes);
      setEdges(entry.edges);
    }
  }, [setNodes, setEdges]);

  useMoodboardShortcuts({
    onDeleteSelected: handleDeleteSelected,
    onSelectAll: handleSelectAll,
    onDuplicateSelected: handleDuplicateSelected,
    onUndo: handleUndo,
    onAddNote: handleAddNote,
    onDeselectAll: handleDeselectAll,
  });

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

  // Minimap node color based on type
  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === 'videoNode') return '#3b82f6';      // blue
    if (node.type === 'imageNode') return '#22c55e';       // green
    if (node.type === 'websiteNode') return '#a855f7';     // purple
    if (node.type === 'stickyNode') return '#eab308';      // yellow
    return '#888888';
  }, []);

  const isEmpty = items.length === 0 && notes.length === 0;
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac');

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
      <div className="flex items-center justify-between px-4 py-2 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
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
            <span className="rounded-full bg-accent-surface px-2.5 py-0.5 text-[10px] font-medium text-accent-text">
              {board.client_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 size={14} />
            Share
          </Button>
          <Button variant="ghost" size="sm" onClick={handleAddNote}>
            <StickyNote size={14} />
            Note
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAddItemOpen(true)}>
            <Plus size={14} />
            Add item
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMinimap(!showMinimap)}
            className={showMinimap ? 'text-accent-text' : ''}
          >
            <Map size={14} />
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        boardId={boardId}
        boardTags={boardTags}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Canvas */}
      <div className="flex-1 relative moodboard-canvas-area">
        {/* Selection/alignment toolbar */}
        <SelectionToolbar
          selectedNodes={selectedNodes}
          onUpdatePositions={handleAlignmentUpdate}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChangeWithSave}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'labeled' }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(255,255,255,0.12)"
            gap={20}
            size={1}
          />
          <Controls position="bottom-left" />
          {showMinimap && (
            <MiniMap
              className="!bg-surface !border-nativz-border !rounded-lg"
              nodeColor={minimapNodeColor}
              maskColor="rgba(0,0,0,0.5)"
              pannable
              zoomable
            />
          )}
        </ReactFlow>

        {/* Empty state overlay */}
        {isEmpty && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="flex flex-col items-center gap-4 text-center max-w-xs">
              <div className="rounded-2xl bg-surface/90 backdrop-blur-md border border-nativz-border p-4 shadow-elevated">
                <Clipboard size={28} className="text-text-muted" />
              </div>
              <div className="rounded-xl bg-surface/80 backdrop-blur-sm border border-nativz-border px-5 py-4">
                <p className="text-sm font-medium text-text-secondary">Paste a link to get started</p>
                <p className="text-xs text-text-muted mt-1.5">
                  Copy any URL and press <kbd className="inline-flex items-center rounded bg-surface-hover border border-nativz-border px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-secondary">{isMac ? '⌘' : 'Ctrl'}+V</kbd> to add it
                </p>
                <p className="text-[10px] text-text-muted mt-2">YouTube, TikTok, Instagram, Twitter/X, images, websites</p>
              </div>
            </div>
          </div>
        )}
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

      {/* Share Board Modal */}
      <ShareBoardModal
        boardId={boardId}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />

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

export default function MoodboardCanvasPage() {
  return (
    <ReactFlowProvider>
      <MoodboardCanvas />
    </ReactFlowProvider>
  );
}
