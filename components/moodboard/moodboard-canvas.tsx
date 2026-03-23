'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  type NodeTypes,
  type EdgeTypes,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowLeft,
  Plus,
  StickyNote,
  Map as MapIcon,
  Loader2,
  Pencil,
  Check,
  X,
  Clipboard,
  Share2,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { VideoNode } from '@/components/moodboard/nodes/video-node';
import { ImageNode } from '@/components/moodboard/nodes/image-node';
import { WebsiteNode } from '@/components/moodboard/nodes/website-node';
import { StickyNode } from '@/components/moodboard/nodes/sticky-node';
import { LabeledEdge } from '@/components/moodboard/edges/labeled-edge';
import { SelectionToolbar } from '@/components/moodboard/toolbar/selection-toolbar';
import { FilterBar } from '@/components/moodboard/filter-bar';
import { useMoodboardShortcuts } from '@/components/moodboard/hooks/use-moodboard-shortcuts';
import { useMoodboardData } from '@/components/moodboard/hooks/use-moodboard-data';

const AddItemModal = dynamic(() =>
  import('@/components/moodboard/add-item-modal').then((m) => ({ default: m.AddItemModal })),
);
const VideoAnalysisPanel = dynamic(() =>
  import('@/components/moodboard/video-analysis-panel').then((m) => ({ default: m.VideoAnalysisPanel })),
);
const ReplicationBriefModal = dynamic(() =>
  import('@/components/moodboard/replication-brief-modal').then((m) => ({ default: m.ReplicationBriefModal })),
);
const ShareBoardModal = dynamic(() =>
  import('@/components/moodboard/share-board-modal').then((m) => ({ default: m.ShareBoardModal })),
);
const AiChatPanel = dynamic(() =>
  import('@/components/moodboard/ai-chat-panel').then((m) => ({ default: m.AiChatPanel })),
);

const nodeTypes: NodeTypes = {
  videoNode: VideoNode,
  imageNode: ImageNode,
  websiteNode: WebsiteNode,
  stickyNode: StickyNode,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

export type MoodboardCanvasVariant = 'analysis' | 'clientWorkspace';

export function MoodboardCanvas({
  boardId,
  variant = 'analysis',
  clientSlug,
}: {
  boardId: string;
  variant?: MoodboardCanvasVariant;
  /** Required when variant is clientWorkspace — used for back navigation to client overview */
  clientSlug?: string;
}) {
  const router = useRouter();
  const mb = useMoodboardData(boardId);
  const isClientWorkspace = variant === 'clientWorkspace';

  useMoodboardShortcuts({
    onDeleteSelected: mb.handleDeleteSelected,
    onSelectAll: mb.handleSelectAll,
    onDuplicateSelected: mb.handleDuplicateSelected,
    onUndo: mb.handleUndo,
    onAddNote: mb.handleAddNote,
    onDeselectAll: mb.handleDeselectAll,
  });

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac');

  function handleBack() {
    if (isClientWorkspace && clientSlug) {
      router.push(`/admin/clients/${clientSlug}`);
      return;
    }
    router.push('/admin/analysis');
  }

  if (mb.loading) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        isClientWorkspace ? 'h-full' : 'h-[calc(100vh-56px)]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nativz-border bg-surface/80 px-3 py-2 backdrop-blur-sm sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            aria-label={isClientWorkspace ? 'Back to client overview' : 'Back to moodboards'}
          >
            <ArrowLeft size={18} />
          </button>

          {mb.editingName ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Input
                value={mb.nameInput}
                onChange={(e) => mb.setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') mb.handleSaveName();
                  if (e.key === 'Escape') {
                    mb.setEditingName(false);
                    mb.setNameInput(mb.board?.name ?? '');
                  }
                }}
                className="h-8 w-40 text-sm sm:w-48"
                autoFocus
              />
              <button
                type="button"
                onClick={mb.handleSaveName}
                className="cursor-pointer rounded p-1 text-accent-text hover:bg-accent-surface"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  mb.setEditingName(false);
                  mb.setNameInput(mb.board?.name ?? '');
                }}
                className="cursor-pointer rounded p-1 text-text-muted hover:bg-surface-hover"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mb.setEditingName(true)}
              className="group flex min-w-0 cursor-pointer items-center gap-1.5 text-sm font-semibold text-text-primary transition-colors hover:text-accent-text"
            >
              <span className="truncate">{mb.board?.name ?? 'Untitled board'}</span>
              <Pencil size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}

          {mb.board?.client_name ? (
            <span className="hidden shrink-0 rounded-full bg-accent-surface px-2.5 py-0.5 text-[10px] font-medium text-accent-text sm:inline">
              {mb.board.client_name}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
          {isClientWorkspace ? (
            <Link
              href={`/admin/analysis/${boardId}`}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <ExternalLink size={14} />
              Full workspace
            </Link>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => mb.setShareOpen(true)}>
            <Share2 size={14} />
            Share
          </Button>
          <Button variant="ghost" size="sm" onClick={mb.handleAddNote}>
            <StickyNote size={14} />
            Note
          </Button>
          <Button variant="ghost" size="sm" onClick={() => mb.setAddItemOpen(true)}>
            <Plus size={14} />
            Add item
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const selIds = mb.selectedNodes.filter((n) => n.type !== 'sticky').map((n) => n.id);
              if (selIds.length > 0) mb.setChatItemIds(selIds);
              mb.setChatOpen(true);
            }}
            className={mb.chatOpen ? 'text-accent-text' : ''}
          >
            <MessageSquare size={14} />
            AI Chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mb.setShowMinimap(!mb.showMinimap)}
            className={mb.showMinimap ? 'text-accent-text' : ''}
          >
            <MapIcon size={14} />
          </Button>
        </div>
      </div>

      <FilterBar
        boardId={boardId}
        boardTags={mb.boardTags}
        filters={mb.filters}
        onFiltersChange={mb.setFilters}
      />

      <div className="relative min-h-0 flex-1 moodboard-canvas-area">
        <SelectionToolbar selectedNodes={mb.selectedNodes} onUpdatePositions={mb.handleAlignmentUpdate} />

        <ReactFlow
          nodes={mb.nodes}
          edges={mb.edges}
          onNodesChange={mb.onNodesChange}
          onEdgesChange={mb.onEdgesChange}
          onConnect={mb.onConnect}
          onConnectStart={mb.onConnectStart}
          onConnectEnd={mb.onConnectEnd}
          onEdgesDelete={(deletedEdges) => {
            for (const edge of deletedEdges) {
              if (edge.data?.dbId) {
                mb.handleDeleteEdge(edge.data.dbId);
              }
            }
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'labeled' }}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          selectionOnDrag
          connectionMode={ConnectionMode.Loose}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode="Shift"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--text-muted)" gap={20} size={1} />
          <Controls position="bottom-left" />
          {mb.showMinimap ? (
            <MiniMap
              className="!bg-surface !border-nativz-border !rounded-lg"
              nodeColor={mb.minimapNodeColor}
              maskColor="rgba(0,0,0,0.5)"
              pannable
              zoomable
            />
          ) : null}
        </ReactFlow>

        {mb.isEmpty && !mb.loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex max-w-xs flex-col items-center gap-4 text-center">
              <div className="rounded-2xl border border-nativz-border bg-surface/90 p-4 shadow-elevated backdrop-blur-md">
                <Clipboard size={28} className="text-text-muted" />
              </div>
              <div className="rounded-xl border border-nativz-border bg-surface/80 px-5 py-4 backdrop-blur-sm">
                <p className="text-sm font-medium text-text-secondary">Paste a link to get started</p>
                <p className="mt-1.5 text-xs text-text-muted">
                  Copy any URL and press{' '}
                  <kbd className="inline-flex items-center rounded border border-nativz-border bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-secondary">
                    {isMac ? '⌘' : 'Ctrl'}+V
                  </kbd>{' '}
                  to add it
                </p>
                <p className="mt-2 text-[10px] text-text-muted">
                  YouTube, TikTok, Instagram, Twitter/X, images, websites
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <AddItemModal
        open={mb.addItemOpen}
        onClose={() => mb.setAddItemOpen(false)}
        boardId={boardId}
        onItemAdded={mb.fetchBoard}
      />

      {mb.analysisItem ? (
        <VideoAnalysisPanel
          item={mb.analysisItem}
          onClose={() => mb.setAnalysisItem(null)}
          onReplicate={(item) => {
            mb.setAnalysisItem(null);
            mb.setReplicateItem(item);
          }}
        />
      ) : null}

      {mb.chatOpen ? (
        <AiChatPanel
          boardId={boardId}
          items={mb.items}
          notes={mb.notes}
          onClose={() => mb.setChatOpen(false)}
        />
      ) : null}

      <ShareBoardModal boardId={boardId} open={mb.shareOpen} onClose={() => mb.setShareOpen(false)} />

      {mb.replicateItem ? (
        <ReplicationBriefModal
          item={mb.replicateItem}
          clientId={mb.board?.client_id ?? null}
          onClose={() => {
            mb.setAnalysisItem(mb.replicateItem);
            mb.setReplicateItem(null);
          }}
          onSaved={(brief) => {
            mb.setItems((prev) =>
              prev.map((i) => (i.id === mb.replicateItem!.id ? { ...i, replication_brief: brief } : i)),
            );
          }}
        />
      ) : null}

      {mb.confirmDeleteSelectedDialog}
    </div>
  );
}
