'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type Connection,
} from 'reactflow';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { detectLinkType, linkTypeToItemType } from '@/lib/types/moodboard';
// mediapipe orchestrator is lazy-loaded to avoid shipping ~8MB WASM in the main bundle
import type { AnalysisStage } from '@/lib/mediapipe/types';
import type { MoodboardBoard, MoodboardItem, MoodboardNote, MoodboardEdge, MoodboardTag, StickyNoteColor } from '@/lib/types/moodboard';
import type { MoodboardFilters } from '@/components/moodboard/filter-bar';

// Undo history entry
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

export function useMoodboardData(boardId: string) {
  const router = useRouter();
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

  // MediaPipe progress tracking (item id → stage + percent)
  const [mediapipeProgress, setMediapipeProgress] = useState<Map<string, { stage: AnalysisStage; percent: number }>>(new Map());

  // Analysis panel
  const [analysisItem, setAnalysisItem] = useState<MoodboardItem | null>(null);
  const [replicateItem, setReplicateItem] = useState<MoodboardItem | null>(null);
  // AI Chat panel
  const [chatOpen, setChatOpen] = useState(false);
  const [chatItemIds, setChatItemIds] = useState<string[]>([]);

  // Tags & filters
  const [boardTags, setBoardTags] = useState<MoodboardTag[]>([]);
  const [itemTagsMap, setItemTagsMap] = useState<Record<string, MoodboardTag[]>>({});
  const [filters, setFilters] = useState<MoodboardFilters>({ platform: 'all', status: 'all', tagIds: [], searchQuery: '' });
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null);

  const { confirm: confirmDeleteSelected, dialog: confirmDeleteSelectedDialog } = useConfirm({
    title: 'Delete selected items',
    description: 'This will permanently delete the selected items. This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Undo history
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);

  const positionSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const nodesRef = useRef<Node[]>([]);

  // Keep nodesRef in sync for use in memoized callbacks
  nodesRef.current = nodes;

  // Track selected nodes
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);

  // Push to undo history (strip functions from node data since structuredClone can't handle them)
  const pushHistory = useCallback(() => {
    const cloneableNodes = nodes.map((n) => {
      const { data, ...rest } = n;
      const cleanData: Record<string, unknown> = {};
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          if (typeof v !== 'function') cleanData[k] = v;
        }
      }
      return { ...rest, data: structuredClone(cleanData) };
    });
    const entry: HistoryEntry = {
      nodes: cloneableNodes,
      edges: structuredClone(edges),
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

  // Fetch item tags for all items in a single batch request
  const fetchAllItemTags = useCallback(async (itemList: MoodboardItem[]) => {
    if (itemList.length === 0) { setItemTagsMap({}); return; }
    try {
      const res = await fetch('/api/moodboard/items/batch-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: itemList.map(i => i.id) }),
      });
      if (res.ok) {
        setItemTagsMap(await res.json());
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchBoard();
    fetchBoardTags();
  }, [fetchBoard, fetchBoardTags]);

  // Listen for toast "View" action to open analysis panel
  useEffect(() => {
    function handleOpenAnalysis(e: Event) {
      const itemId = (e as CustomEvent).detail?.itemId;
      if (itemId) {
        const item = items.find((i) => i.id === itemId);
        if (item) setAnalysisItem(item);
      }
    }
    window.addEventListener('open-analysis', handleOpenAnalysis);
    return () => window.removeEventListener('open-analysis', handleOpenAnalysis);
  }, [items]);

  // Fetch item tags when items change
  useEffect(() => {
    if (items.length > 0) fetchAllItemTags(items);
  }, [items, fetchAllItemTags]);

  // Auto-trigger MediaPipe analysis for video items that haven't been analyzed yet
  const analyzedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const item of items) {
      if (
        item.type === 'video' &&
        item.status === 'completed' &&
        item.duration &&
        !item.mediapipe_analysis &&
        !mediapipeProgress.has(item.id) &&
        !analyzedIdsRef.current.has(item.id)
      ) {
        analyzedIdsRef.current.add(item.id);
        triggerMediaPipeAnalysis(item.id, item.duration);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

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
      setNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
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

  // Convert items + notes to React Flow nodes, preserving current canvas positions
  useEffect(() => {
    const currentPositions = new Map(nodesRef.current.map((n) => [n.id, n.position]));

    const itemNodes: Node[] = items.map((item) => {
      const nodeId = `item-${item.id}`;
      const pos = currentPositions.get(nodeId);
      return {
        id: nodeId,
        type: item.type === 'video' ? 'videoNode' : item.type === 'image' ? 'imageNode' : 'websiteNode',
        position: pos ?? { x: item.position_x, y: item.position_y },
        hidden: !itemPassesFilter(item),
        data: {
          item,
          onViewAnalysis: (i: MoodboardItem) => setAnalysisItem(i),
          onDelete: handleDeleteItem,
          onExtractInsights: handleExtractInsights,
          onItemUpdate: (updated: MoodboardItem) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i))),
          mediapipeProgress: mediapipeProgress.get(item.id) ?? null,
        },
        style: { width: item.width || (item.platform === 'tiktok' || item.platform === 'instagram' || item.platform === 'facebook' ? 220 : 320) },
      };
    });

    const noteNodes: Node[] = notes.map((note) => {
      const nodeId = `note-${note.id}`;
      const pos = currentPositions.get(nodeId);
      return {
        id: nodeId,
        type: 'stickyNode',
        position: pos ?? { x: note.position_x, y: note.position_y },
        data: {
          note,
          onUpdate: handleUpdateNote,
          onDelete: handleDeleteNote,
          onColorChange: handleNoteColorChange,
        },
        style: { width: note.width },
      };
    });

    setNodes([...itemNodes, ...noteNodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, notes, itemPassesFilter, mediapipeProgress]);

  // Convert db edges to React Flow edges
  useEffect(() => {
    const flowEdges: Edge[] = dbEdges.map((e) => ({
      id: `edge-${e.id}`,
      source: e.source_node_id,
      sourceHandle: e.source_handle ?? undefined,
      target: e.target_node_id,
      targetHandle: e.target_handle ?? undefined,
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
  const connectHandledRef = useRef(false);

  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    connectHandledRef.current = true;

    try {
      const res = await fetch('/api/moodboard/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          source_node_id: connection.source,
          target_node_id: connection.target,
          source_handle: connection.sourceHandle ?? null,
          target_handle: connection.targetHandle ?? null,
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

  // Track connection start for drop-on-node
  const connectingRef = useRef<{ nodeId: string; handleId: string | null } | null>(null);

  const onConnectStart = useCallback((_: unknown, params: { nodeId: string | null; handleId: string | null }) => {
    connectingRef.current = { nodeId: params.nodeId ?? '', handleId: params.handleId };
    connectHandledRef.current = false;
  }, []);

  const onConnectEnd = useCallback(async (event: MouseEvent | TouchEvent) => {
    const source = connectingRef.current;
    connectingRef.current = null;

    if (connectHandledRef.current || !source) return;

    const targetEl = (event as MouseEvent).target as HTMLElement;
    const nodeEl = targetEl?.closest('.react-flow__node');
    if (!nodeEl) return;

    const targetNodeId = nodeEl.getAttribute('data-id');
    if (!targetNodeId || targetNodeId === source.nodeId) return;

    try {
      const res = await fetch('/api/moodboard/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          source_node_id: source.nodeId,
          target_node_id: targetNodeId,
          source_handle: source.handleId ?? null,
          target_handle: null,
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
      setTimeout(() => fetchBoard(), 8000);
      setTimeout(() => fetchBoard(), 15000);
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
    setTimeout(() => fetchBoard(), 8000);
    setTimeout(() => fetchBoard(), 15000);
    setPasting(false);
  }

  /**
   * Trigger MediaPipe client-side analysis for a video item.
   */
  async function triggerMediaPipeAnalysis(itemId: string, durationSeconds: number) {
    try {
      const res = await fetch(`/api/moodboard/items/${itemId}/video-url`);
      if (!res.ok) return;
      const { videoUrl } = await res.json();
      if (!videoUrl) return;

      const durationMs = durationSeconds * 1000;

      const { runAndPersistAnalysis } = await import('@/lib/mediapipe/orchestrator');
      runAndPersistAnalysis(itemId, videoUrl, durationMs, (stage, percent) => {
        setMediapipeProgress((prev) => {
          const next = new Map(prev);
          if (stage === 'complete') {
            next.delete(itemId);
          } else {
            next.set(itemId, { stage, percent });
          }
          return next;
        });
      }).then((success) => {
        if (success) {
          fetchBoard();
        }
      });
    } catch {
      // Silent fail — MediaPipe is non-critical
    }
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
    const currentNodes = nodesRef.current;
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
    if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
    positionSaveTimer.current = setTimeout(() => savePositions(), 500);
  }, [setNodes, pushHistory]);

  // Keyboard shortcut handlers
  const handleDeleteSelected = useCallback(async () => {
    const selectedNodesList = nodes.filter((n) => n.selected);
    const selectedEdgesList = edges.filter((e) => e.selected);

    if (selectedNodesList.length === 0 && selectedEdgesList.length === 0) return;

    const ok = await confirmDeleteSelected();
    if (!ok) return;

    pushHistory();
    for (const node of selectedNodesList) {
      if (node.id.startsWith('item-')) {
        handleDeleteItem(node.id.replace('item-', ''));
      } else if (node.id.startsWith('note-')) {
        handleDeleteNote(node.id.replace('note-', ''));
      }
    }

    for (const edge of selectedEdgesList) {
      if (edge.data?.dbId) {
        handleDeleteEdge(edge.data.dbId);
      }
    }
  }, [nodes, edges, pushHistory, handleDeleteEdge, confirmDeleteSelected]);

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
      // Merge history positions/visibility with current nodes to preserve function references in data
      const historyMap = new Map(entry.nodes.map((n) => [n.id, n]));
      setNodes((prev) => {
        const merged = prev.map((n) => {
          const hist = historyMap.get(n.id);
          if (!hist) return n;
          return { ...n, position: hist.position, hidden: hist.hidden, selected: hist.selected };
        });
        // Restore any nodes from history that aren't in current (e.g. deleted nodes)
        for (const hn of entry.nodes) {
          if (!prev.find((n) => n.id === hn.id)) merged.push(hn);
        }
        return merged;
      });
      setEdges(entry.edges);
    }
  }, [setNodes, setEdges]);

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
    if (node.type === 'videoNode') return '#3b82f6';
    if (node.type === 'imageNode') return '#22c55e';
    if (node.type === 'websiteNode') return '#a855f7';
    if (node.type === 'stickyNode') return '#eab308';
    return '#888888';
  }, []);

  const isEmpty = items.length === 0 && notes.length === 0;

  return {
    // State
    board,
    items,
    notes,
    loading,
    addItemOpen, setAddItemOpen,
    shareOpen, setShareOpen,
    showMinimap, setShowMinimap,
    editingName, setEditingName,
    nameInput, setNameInput,
    analysisItem, setAnalysisItem,
    replicateItem, setReplicateItem,
    chatOpen, setChatOpen,
    chatItemIds, setChatItemIds,
    boardTags,
    filters, setFilters,
    nodes, edges,
    selectedNodes,
    isEmpty,

    // Handlers
    onNodesChange: handleNodesChangeWithSave,
    onEdgesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    handleDeleteEdge,
    handleAddNote,
    handleSaveName,
    handleAlignmentUpdate,
    handleDeleteSelected,
    handleSelectAll,
    handleDeselectAll,
    handleDuplicateSelected,
    handleUndo,
    minimapNodeColor,
    setItems,
    fetchBoard,
    confirmDeleteSelectedDialog,
  };
}
