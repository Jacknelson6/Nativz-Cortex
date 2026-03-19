'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  FileText,
  Globe,
  Palette,
  StickyNote,
  User,
  Search,
  Target,
  Lightbulb,
} from 'lucide-react';

const TYPE_STYLES: Record<string, { border: string; bg: string; icon: React.ElementType; label: string }> = {
  brand_profile: { border: 'border-blue-500', bg: 'bg-blue-500/10', icon: Palette, label: 'Brand profile' },
  brand_asset: { border: 'border-blue-500', bg: 'bg-blue-500/10', icon: Palette, label: 'Brand asset' },
  web_page: { border: 'border-green-500', bg: 'bg-green-500/10', icon: Globe, label: 'Web page' },
  note: { border: 'border-yellow-500', bg: 'bg-yellow-500/10', icon: StickyNote, label: 'Note' },
  document: { border: 'border-accent2', bg: 'bg-accent2-surface', icon: FileText, label: 'Document' },
  contact: { border: 'border-orange-500', bg: 'bg-orange-500/10', icon: User, label: 'Contact' },
  search: { border: 'border-teal-500', bg: 'bg-teal-500/10', icon: Search, label: 'Search' },
  strategy: { border: 'border-red-500', bg: 'bg-red-500/10', icon: Target, label: 'Strategy' },
  idea: { border: 'border-pink-500', bg: 'bg-pink-500/10', icon: Lightbulb, label: 'Idea' },
  idea_submission: { border: 'border-pink-500', bg: 'bg-pink-500/10', icon: Lightbulb, label: 'Idea' },
};

const DEFAULT_STYLE = { border: 'border-slate-500', bg: 'bg-slate-500/10', icon: FileText, label: 'Entry' };

interface KnowledgeNodeData {
  type: string;
  title: string;
  subtitle?: string;
}

function KnowledgeNodeCardInner({ data }: NodeProps<KnowledgeNodeData>) {
  const style = TYPE_STYLES[data.type] ?? DEFAULT_STYLE;
  const Icon = style.icon;

  return (
    <div
      className={`rounded-lg border ${style.border} ${style.bg} px-3 py-2 w-[220px] shadow-md cursor-pointer transition-shadow hover:shadow-lg`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2 !border-0" />

      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-text-secondary shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">
          {style.label}
        </span>
      </div>

      <p className="text-sm font-medium text-text-primary truncate">{data.title}</p>

      {data.subtitle && (
        <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">{data.subtitle}</p>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2 !border-0" />
    </div>
  );
}

export const KnowledgeNodeCard = memo(KnowledgeNodeCardInner);
