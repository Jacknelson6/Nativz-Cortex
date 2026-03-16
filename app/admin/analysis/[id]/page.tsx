'use client';

import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VideoNode } from '@/components/moodboard/nodes/video-node';
import { ImageNode } from '@/components/moodboard/nodes/image-node';
import { WebsiteNode } from '@/components/moodboard/nodes/website-node';
import { StickyNode } from '@/components/moodboard/nodes/sticky-node';
import { LabeledEdge } from '@/components/moodboard/edges/labeled-edge';
import { SelectionToolbar } from '@/components/moodboard/toolbar/selection-toolbar';
import { FilterBar } from '@/components/moodboard/filter-bar';
import { useMoodboardShortcuts } from '@/components/moodboard/hooks/use-moodboard-shortcuts';
import { useMoodboardData } from '@/components/moodboard/hooks/use-moodboard-data';

const AddItemModal = dynamic(() => import('@/components/moodboard/add-item-modal').then(m => ({ default: m.AddItemModal })));
const VideoAnalysisPanel = dynamic(() => import('@/components/moodboard/video-analysis-panel').then(m => ({ default: m.VideoAnalysisPanel })));
const ReplicationBriefModal = dynamic(() => import('@/components/moodboard/replication-brief-modal').then(m => ({ default: m.ReplicationBriefModal })));
const ShareBoardModal = dynamic(() => import('@/components/moodboard/share-board-modal').then(m => ({ default: m.ShareBoardModal })));
const AiChatPanel = dynamic(() => import('@/components/moodboard/ai-chat-panel').then(m => ({ default: m.AiChatPanel })));

const nodeTypes: NodeTypes = {
  videoNode: VideoNode,
  imageNode: ImageNode,
  websiteNode: WebsiteNode,
  stickyNode: StickyNode,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

function MoodboardCanvas() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const mb = useMoodboardData(boardId);

  useMoodboardShortcuts({
    onDeleteSelected: mb.handleDeleteSelected,
    onSelectAll: mb.handleSelectAll,
    onDuplicateSelected: mb.handleDuplicateSelected,
    onUndo: mb.handleUndo,
    onAddNote: mb.handleAddNote,
    onDeselectAll: mb.handleDeselectAll,
  });

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac');

  if (mb.loading) {
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
            onClick={() => router.push('/admin/analysis')}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={18} />
          </button>

          {mb.editingName ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={mb.nameInput}
                onChange={(e) => mb.setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') mb.handleSaveName(); if (e.key === 'Escape') { mb.setEditingName(false); mb.setNameInput(mb.board?.name ?? ''); } }}
                className="h-8 text-sm w-48"
                autoFocus
              />
              <button onClick={mb.handleSaveName} className="cursor-pointer rounded p-1 text-accent-text hover:bg-accent-surface"><Check size={14} /></button>
              <button onClick={() => { mb.setEditingName(false); mb.setNameInput(mb.board?.name ?? ''); }} className="cursor-pointer rounded p-1 text-text-muted hover:bg-surface-hover"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => mb.setEditingName(true)}
              className="cursor-pointer flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-accent-text transition-colors group"
            >
              {mb.board?.name ?? 'Untitled board'}
              <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {mb.board?.client_name && (
            <span className="rounded-full bg-accent-surface px-2.5 py-0.5 text-[10px] font-medium text-accent-text">
              {mb.board.client_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
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
              const selIds = mb.selectedNodes.filter(n => n.type !== 'sticky').map(n => n.id);
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

      {/* Filter Bar */}
      <FilterBar
        boardId={boardId}
        boardTags={mb.boardTags}
        filters={mb.filters}
        onFiltersChange={mb.setFilters}
      />

      {/* Canvas */}
      <div className="flex-1 relative moodboard-canvas-area">
        {/* Selection/alignment toolbar */}
        <SelectionToolbar
          selectedNodes={mb.selectedNodes}
          onUpdatePositions={mb.handleAlignmentUpdate}
        />

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
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(255,255,255,0.12)"
            gap={20}
            size={1}
          />
          <Controls position="bottom-left" />
          {mb.showMinimap && (
            <MiniMap
              className="!bg-surface !border-nativz-border !rounded-lg"
              nodeColor={mb.minimapNodeColor}
              maskColor="rgba(0,0,0,0.5)"
              pannable
              zoomable
            />
          )}
        </ReactFlow>

        {/* Empty state overlay */}
        {mb.isEmpty && !mb.loading && (
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
        open={mb.addItemOpen}
        onClose={() => mb.setAddItemOpen(false)}
        boardId={boardId}
        onItemAdded={mb.fetchBoard}
      />

      {/* Video Analysis Panel */}
      {mb.analysisItem && (
        <VideoAnalysisPanel
          item={mb.analysisItem}
          onClose={() => mb.setAnalysisItem(null)}
          onReplicate={(item) => { mb.setAnalysisItem(null); mb.setReplicateItem(item); }}
        />
      )}

      {/* AI Chat Panel */}
      {mb.chatOpen && (
        <AiChatPanel
          boardId={boardId}
          items={mb.items}
          notes={mb.notes}
          onClose={() => mb.setChatOpen(false)}
        />
      )}

      {/* Share Board Modal */}
      <ShareBoardModal
        boardId={boardId}
        open={mb.shareOpen}
        onClose={() => mb.setShareOpen(false)}
      />

      {/* Rescript Modal */}
      {mb.replicateItem && (
        <ReplicationBriefModal
          item={mb.replicateItem}
          clientId={mb.board?.client_id ?? null}
          onClose={() => { mb.setAnalysisItem(mb.replicateItem); mb.setReplicateItem(null); }}
          onSaved={(brief) => {
            mb.setItems((prev) => prev.map((i) => (i.id === mb.replicateItem!.id ? { ...i, replication_brief: brief } : i)));
          }}
        />
      )}

      {mb.confirmDeleteSelectedDialog}
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
