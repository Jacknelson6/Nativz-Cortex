'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Key, Search, Shield, Building2, Layers, Brain, Lightbulb, Video,
  CheckSquare, GitBranch, Camera, Microscope, Bot, Calendar, BarChart3,
  Globe, Users, Bell, Database, LayoutDashboard, UserPlus, Settings,
  Workflow, ListTodo, Plug, Clock,
} from 'lucide-react';
import { API_SECTIONS, API_ENDPOINTS } from './api-docs-data';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Shield, Key, Search, Building2, Layers, Brain, Lightbulb, Video,
  CheckSquare, GitBranch, Camera, Microscope, Bot, Calendar, BarChart3,
  Globe, Users, Bell, Database, LayoutDashboard, UserPlus, Settings,
  Workflow, ListTodo, Plug, Clock,
};

export default function ApiDocsSidebar() {
  const pathname = usePathname();
  const [filter, setFilter] = useState('');

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ep of API_ENDPOINTS) {
      counts.set(ep.sectionSlug, (counts.get(ep.sectionSlug) ?? 0) + 1);
    }
    return counts;
  }, []);

  const filteredSections = useMemo(() => {
    if (!filter) return API_SECTIONS;
    const q = filter.toLowerCase();
    return API_SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [filter]);

  return (
    <aside className="w-64 shrink-0 bg-surface border-r border-nativz-border flex flex-col h-[calc(100vh-3.5rem)] sticky top-[3.5rem]">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-nativz-border">
        <Link
          href="/admin/nerd/api"
          className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-accent-text transition-colors"
        >
          <Key size={16} className="text-blue-400" />
          API reference
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sections..."
            className="w-full bg-background border border-nativz-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
          />
        </div>
      </div>

      {/* Section list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        <div className="space-y-0.5">
          {filteredSections.map((section) => {
            const Icon = ICON_MAP[section.icon];
            const count = sectionCounts.get(section.slug) ?? 0;
            const href = `/admin/nerd/api/${section.slug}`;
            const isActive = pathname === href;

            return (
              <Link
                key={section.slug}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors group ${
                  isActive
                    ? 'bg-accent-surface text-accent-text'
                    : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
                }`}
              >
                {Icon && (
                  <Icon
                    size={14}
                    className={isActive ? 'text-accent-text' : 'text-text-muted group-hover:text-text-secondary'}
                  />
                )}
                <span className="flex-1 truncate">{section.title}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums ${
                    isActive ? 'text-accent-text/70' : 'text-text-muted/50'
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-nativz-border">
        <Link
          href="/admin/settings"
          className="flex items-center gap-2 text-[11px] text-text-muted hover:text-accent-text transition-colors"
        >
          <Key size={12} />
          Manage API keys
        </Link>
      </div>
    </aside>
  );
}
