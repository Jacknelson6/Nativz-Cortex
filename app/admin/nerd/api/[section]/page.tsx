import { notFound } from 'next/navigation';
import {
  Shield, Key, Search, Building2, Layers, Brain, Lightbulb, Video,
  CheckSquare, GitBranch, Camera, Microscope, Bot, Calendar, BarChart3,
  Globe, Users, Bell, Database, LayoutDashboard, UserPlus, Settings,
  Workflow, ListTodo, Plug, Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { API_SECTIONS, API_ENDPOINTS } from '../api-docs-data';
import SectionEndpoints from './section-endpoints';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Shield, Key, Search, Building2, Layers, Brain, Lightbulb, Video,
  CheckSquare, GitBranch, Camera, Microscope, Bot, Calendar, BarChart3,
  Globe, Users, Bell, Database, LayoutDashboard, UserPlus, Settings,
  Workflow, ListTodo, Plug, Clock,
};

export function generateStaticParams() {
  return API_SECTIONS.map((s) => ({ section: s.slug }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: slug } = await params;
  const section = API_SECTIONS.find((s) => s.slug === slug);

  if (!section) notFound();

  const endpoints = API_ENDPOINTS.filter((ep) => ep.sectionSlug === slug);
  const Icon = ICON_MAP[section.icon];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          {Icon && (
            <div className="rounded-lg bg-white/[0.04] p-2.5">
              <Icon size={20} className="text-accent-text" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-text-primary">{section.title}</h1>
              <Badge variant="info">{endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}</Badge>
            </div>
            <p className="text-sm text-text-muted mt-0.5">{section.description}</p>
          </div>
        </div>
      </div>

      {/* Endpoints list (client component for expand/collapse) */}
      <SectionEndpoints endpoints={endpoints} />

      <div className="h-20" />
    </div>
  );
}
