'use client';

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { KnowledgeGraphData } from '@/lib/knowledge/types';
import { getLayoutedElements } from '@/lib/knowledge/graph-layout';
import { KnowledgeNodeCard } from './KnowledgeNodeCard';
import { KnowledgeToolbar } from './KnowledgeToolbar';
import { KnowledgePanel } from './KnowledgePanel';

const nodeTypes: NodeTypes = {
  knowledge: KnowledgeNodeCard,
};

const MINIMAP_COLORS: Record<string, string> = {
  brand_profile: '#3b82f6',
  brand_asset: '#3b82f6',
  web_page: '#22c55e',
  note: '#eab308',
  document: '#a855f7',
  contact: '#f97316',
  search: '#14b8a6',
  strategy: '#ef4444',
  idea: '#ec4899',
  idea_submission: '#ec4899',
};

function buildGraph(data: KnowledgeGraphData) {
  const rawNodes: Node[] = [];
  const rawEdges: Edge[] = [];

  // Entry nodes
  for (const entry of data.entries) {
    rawNodes.push({
      id: `entry-${entry.id}`,
      type: 'knowledge',
      position: { x: 0, y: 0 },
      data: {
        type: entry.type,
        title: entry.title,
        subtitle: entry.content?.slice(0, 120) || undefined,
        content: entry.content,
        metadata: entry.metadata,
        source: entry.source,
        created_at: entry.created_at,
        nodeKind: 'entry',
        entryId: entry.id,
      },
    });
  }

  // External nodes
  for (const ext of data.externalNodes) {
    rawNodes.push({
      id: `${ext.type}-${ext.id}`,
      type: 'knowledge',
      position: { x: 0, y: 0 },
      data: {
        type: ext.type,
        title: ext.title,
        subtitle: ext.subtitle || undefined,
        created_at: ext.created_at,
        nodeKind: 'external',
      },
    });
  }

  // Edges from links
  for (const link of data.links) {
    const sourceId = link.source_type === 'entry' ? `entry-${link.source_id}` : `${link.source_type}-${link.source_id}`;
    const targetId = link.target_type === 'entry' ? `entry-${link.target_id}` : `${link.target_type}-${link.target_id}`;

    rawEdges.push({
      id: `link-${link.id}`,
      source: sourceId,
      target: targetId,
      animated: true,
      style: { stroke: '#64748b' },
      label: link.label || undefined,
      labelStyle: { fill: '#94a3b8', fontSize: 10 },
    });
  }

  return getLayoutedElements(rawNodes, rawEdges);
}

interface KnowledgeGraphInnerProps {
  clientId: string;
  clientSlug: string;
  initialData: KnowledgeGraphData;
}

function KnowledgeGraphInner({
  clientId,
  clientSlug,
  initialData,
}: KnowledgeGraphInnerProps) {
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const { nodes: allNodes, edges: allEdges } = useMemo(() => buildGraph(initialData), [initialData]);

  // Apply filters
  const filteredNodes = useMemo(() => {
    return allNodes.filter((node) => {
      const data = node.data as { type: string; title: string; subtitle?: string };

      // Type filter
      if (typeFilters.size > 0 && !typeFilters.has(data.type)) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = data.title?.toLowerCase().includes(q);
        const subtitleMatch = data.subtitle?.toLowerCase().includes(q);
        if (!titleMatch && !subtitleMatch) return false;
      }

      return true;
    });
  }, [allNodes, typeFilters, searchQuery]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return allEdges.filter(
      (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );
  }, [allEdges, filteredNodeIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(filteredNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filteredEdges);

  // Re-layout when filters change
  useMemo(() => {
    const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(filteredNodes, filteredEdges);
    setNodes(layouted);
    setEdges(layoutedEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes, filteredEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNode(node);
  }, []);

  const minimapNodeColor = useCallback((node: Node) => {
    const type = (node.data as { type: string }).type;
    return MINIMAP_COLORS[type] ?? '#64748b';
  }, []);

  const isEmpty = allNodes.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <KnowledgeToolbar
        clientId={clientId}
        typeFilters={typeFilters}
        onTypeFiltersChange={setTypeFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex-1 relative">
        {isEmpty ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <p className="text-sm font-medium text-text-secondary">No knowledge entries yet</p>
              <p className="text-xs text-text-muted mt-1.5">
                Add entries manually, scrape a website, or generate a brand profile to get started.
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} color="#334155" size={1} />
            <Controls position="bottom-left" />
            <MiniMap
              className="!bg-surface !border-nativz-border !rounded-lg"
              nodeColor={minimapNodeColor}
              maskColor="rgba(0,0,0,0.5)"
              pannable
              zoomable
            />
          </ReactFlow>
        )}
      </div>

      {selectedNode && (
        <KnowledgePanel
          node={selectedNode}
          clientId={clientSlug}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

interface KnowledgeGraphProps {
  clientId: string;
  clientSlug: string;
  initialData: KnowledgeGraphData;
}

export function KnowledgeGraph(props: KnowledgeGraphProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
