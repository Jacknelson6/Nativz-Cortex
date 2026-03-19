'use client';

import { useState } from 'react';
import {
  ArrowLeft, Save, Loader2, Play, Eye, EyeOff, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';
import { BENCHMARK_SECTIONS } from '@/lib/benchmarks/sections';
import type { PresentationData, BenchmarkConfig } from './types';
import { BenchmarksViewer } from './benchmarks-viewer';
import { DEFAULT_SECTION_ORDER, DEFAULT_VISIBLE_SECTIONS } from '@/lib/benchmarks/sections';

interface BenchmarksEditorProps {
  presentation: PresentationData;
  saving: boolean;
  clients: ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => void;
  onBack: () => void;
  onPresent: () => void;
}

function getConfig(presentation: PresentationData): BenchmarkConfig {
  const raw = presentation.audit_data as unknown as BenchmarkConfig | undefined;
  if (raw && Array.isArray(raw.section_order) && Array.isArray(raw.visible_sections)) {
    return raw;
  }
  return {
    visible_sections: DEFAULT_VISIBLE_SECTIONS,
    section_order: DEFAULT_SECTION_ORDER,
    active_vertical_filter: null,
  };
}

export function BenchmarksEditor({
  presentation, saving, clients, update, onSave, onBack, onPresent,
}: BenchmarksEditorProps) {
  const config = getConfig(presentation);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  function updateConfig(partial: Partial<BenchmarkConfig>) {
    const newConfig = { ...config, ...partial };
    // Store benchmark config in audit_data (generic JSONB column)
    update({ audit_data: newConfig as unknown as PresentationData['audit_data'] });
  }

  function toggleVisibility(sectionId: string) {
    const visible = config.visible_sections.includes(sectionId)
      ? config.visible_sections.filter((id) => id !== sectionId)
      : [...config.visible_sections, sectionId];
    updateConfig({ visible_sections: visible });
  }

  function moveSection(sectionId: string, direction: 'up' | 'down') {
    const order = [...config.section_order];
    const idx = order.indexOf(sectionId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    updateConfig({ section_order: order });
  }

  const orderedSections = config.section_order.map((id) =>
    BENCHMARK_SECTIONS.find((s) => s.id === id)
  ).filter(Boolean);

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-nativz-border bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>

        <input
          type="text"
          value={presentation.title}
          onChange={(e) => update({ title: e.target.value })}
          className="flex-1 bg-transparent text-lg font-semibold text-text-primary outline-none placeholder:text-text-muted/50"
          placeholder="Presentation title"
        />

        <ClientPickerButton
          clients={clients}
          value={presentation.client_id}
          onChange={(cid: string | null) => update({ client_id: cid })}
          placeholder="Assign to client"
        />

        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Loader2 size={12} className="animate-spin" />
              Saving
            </span>
          )}
          <Button variant="outline" size="sm" onClick={onSave}>
            <Save size={14} />
            Save
          </Button>
          <Button size="sm" onClick={onPresent}>
            <Play size={14} />
            Present
          </Button>
        </div>
      </div>

      {/* Body: sidebar + preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: section list */}
        <div className="w-80 border-r border-nativz-border bg-surface/30 overflow-y-auto shrink-0">
          <div className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
              Sections ({config.visible_sections.length}/{BENCHMARK_SECTIONS.length} visible)
            </h3>
            <div className="space-y-1">
              {orderedSections.map((section, idx) => {
                const isVisible = config.visible_sections.includes(section!.id);
                const isSelected = selectedSection === section!.id;

                return (
                  <div
                    key={section!.id}
                    className={`group rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-accent/40 bg-accent-surface/30'
                        : 'border-transparent hover:bg-surface-hover'
                    }`}
                  >
                    <div className="flex items-center gap-2 p-2">
                      {/* Reorder buttons */}
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => moveSection(section!.id, 'up')}
                          disabled={idx === 0}
                          className="cursor-pointer p-0.5 text-text-muted hover:text-text-secondary disabled:opacity-20 transition-colors"
                        >
                          <ChevronUp size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(section!.id, 'down')}
                          disabled={idx === orderedSections.length - 1}
                          className="cursor-pointer p-0.5 text-text-muted hover:text-text-secondary disabled:opacity-20 transition-colors"
                        >
                          <ChevronDown size={10} />
                        </button>
                      </div>

                      {/* Section title (clickable for preview) */}
                      <button
                        type="button"
                        onClick={() => setSelectedSection(isSelected ? null : section!.id)}
                        className="cursor-pointer flex-1 text-left min-w-0"
                      >
                        <span className={`text-xs font-medium block truncate ${
                          isVisible ? 'text-text-primary' : 'text-text-muted line-through'
                        }`}>
                          {section!.title}
                        </span>
                        <span className="text-[10px] text-text-muted">{section!.id}</span>
                      </button>

                      {/* Visibility toggle */}
                      <button
                        type="button"
                        onClick={() => toggleVisibility(section!.id)}
                        className={`cursor-pointer p-1.5 rounded-md transition-colors ${
                          isVisible
                            ? 'text-accent-text hover:bg-accent-surface/50'
                            : 'text-text-muted/40 hover:bg-surface-hover'
                        }`}
                      >
                        {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedSection ? (
            <BenchmarksViewer
              config={config}
              previewSectionId={selectedSection}
            />
          ) : (
            <BenchmarksViewer config={config} />
          )}
        </div>
      </div>
    </div>
  );
}
