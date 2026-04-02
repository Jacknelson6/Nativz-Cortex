'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronRight,
  GitBranch,
  Layers,
  MessageSquareText,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface LinkedBoard {
  id: string;
  name: string;
}

export interface LinkedIdeaGen {
  id: string;
  count: number;
  concept: string | null;
}

interface IdeationPipelinePanelProps {
  searchId: string;
  query: string;
  videoCandidateCount: number;
  linkedBoards: LinkedBoard[];
  linkedIdeas: LinkedIdeaGen[];
  onOpenIdeasWizard: () => void;
}

type Path = 'pillars' | 'chat';

export function IdeationPipelinePanel({
  searchId,
  query,
  linkedIdeas,
  onOpenIdeasWizard,
}: IdeationPipelinePanelProps) {
  const [selectedPath, setSelectedPath] = useState<Path | null>(null);

  const step2Done = linkedIdeas.length > 0;

  return (
    <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 via-transparent to-accent2/5 p-0">
      {/* Header — full width */}
      <div className="border-b border-nativz-border/60 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Layers size={20} className="text-accent" />
            Ideation pipeline
          </CardTitle>
          <p className="text-sm text-text-muted max-w-xl leading-relaxed sm:text-right">
            Turn this topic search into short-form video ideas — pick a path, then create or explore.
          </p>
        </div>
      </div>

      {/* Two-column layout on large screens: topic (narrow) + ideas (wide) */}
      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
        {/* Step 1 — left rail */}
        <aside className="lg:col-span-4 xl:col-span-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 shadow-sm shadow-black/10">
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15">
                <Check size={14} strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold uppercase tracking-wide">Topic search</span>
            </div>
            <p className="mt-3 text-base font-medium leading-snug text-text-primary [overflow-wrap:anywhere] sm:text-[17px]">
              &ldquo;{query}&rdquo;
            </p>
            <Link
              href="/admin/search/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
            >
              <Plus size={12} />
              Add another search
            </Link>
          </div>
        </aside>

        {/* Step 2 — main workspace */}
        <section className="min-w-0 lg:col-span-8 xl:col-span-9">
          <div className="rounded-xl border border-nativz-border bg-surface/40 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                  step2Done
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-accent/40 bg-accent/10 text-accent-text',
                )}
              >
                {step2Done ? <Check size={15} strokeWidth={2.5} /> : '2'}
              </span>
              <div>
                <h3 className="text-base font-semibold text-text-primary">Generate ideas</h3>
                <p className="mt-1 text-sm text-text-muted leading-relaxed">
                  {step2Done
                    ? 'Ideas are linked to this search — open them or generate more.'
                    : 'Choose how you want to go from research to video concepts.'}
                </p>
              </div>
            </div>

            {step2Done ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border/60 pt-4">
                <p className="text-sm font-medium text-emerald-400">
                  {linkedIdeas[0]?.count ?? 0} ideas generated
                </p>
                <Link
                  href={`/admin/ideas/${linkedIdeas[0].id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
                >
                  View ideas <ChevronRight size={12} />
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={onOpenIdeasWizard}
                >
                  Generate more
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-2 xl:gap-5">
                  <PathCard
                    selected={selectedPath === 'pillars'}
                    onClick={() => setSelectedPath(selectedPath === 'pillars' ? null : 'pillars')}
                    icon={<GitBranch size={18} />}
                    title="Content pillars"
                    description="Align existing pillars to topics, or let AI create new ones and generate ideas"
                  />
                  <PathCard
                    selected={selectedPath === 'chat'}
                    onClick={() => setSelectedPath(selectedPath === 'chat' ? null : 'chat')}
                    icon={<MessageSquareText size={18} />}
                    title="Chat with the data"
                    description="Explore the research conversationally and surface ideas through dialogue"
                  />
                </div>

                {selectedPath && !step2Done ? (
                  <div className="border-t border-nativz-border/60 pt-4">
                    {selectedPath === 'pillars' ? (
                      <PathDetail>
                        <div className="space-y-3">
                          <SubStepRow label="a" accent="accent">
                            Align existing content pillars to your topic searches and generate new video ideas
                          </SubStepRow>
                          <SubStepRow label="b" accent="accent2">
                            Create new content pillars based on AI recommendations and generate ideas from them
                          </SubStepRow>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="mt-2 h-9 gap-1.5 text-sm"
                            onClick={onOpenIdeasWizard}
                          >
                            <Sparkles size={14} />
                            Create ideas
                          </Button>
                        </div>
                      </PathDetail>
                    ) : (
                      <PathDetail>
                        <p className="text-sm leading-relaxed text-text-secondary">
                          Ask questions about the research, explore angles, and discover ideas through conversation.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Link href={`/admin/search/${searchId}/processing`}>
                            <Button type="button" variant="primary" size="sm" className="h-9 gap-1.5 text-sm">
                              <MessageSquareText size={14} />
                              Continue research
                            </Button>
                          </Link>
                          <Link
                            href="/admin/search/new"
                            className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-accent-text"
                          >
                            <Search size={12} />
                            Add more searches
                          </Link>
                        </div>
                      </PathDetail>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </Card>
  );
}

function PathDetail({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-background/40 px-3 py-3 sm:px-4">{children}</div>
  );
}

function SubStepRow({
  label,
  accent,
  children,
}: {
  label: string;
  accent: 'accent' | 'accent2';
  children: ReactNode;
}) {
  const circle =
    accent === 'accent'
      ? 'bg-accent/20 text-accent-text'
      : 'bg-accent2/20 text-accent2-text';
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
          circle,
        )}
      >
        {label}
      </span>
      <p className="text-sm leading-relaxed text-text-secondary">{children}</p>
    </div>
  );
}

function PathCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[112px] w-full flex-col gap-2 rounded-xl border p-4 text-left transition-all cursor-pointer sm:min-h-[120px]',
        selected
          ? 'border-accent/50 bg-accent/10 shadow-md shadow-accent/5 ring-1 ring-accent/20'
          : 'border-nativz-border bg-surface/80 hover:border-accent/25 hover:bg-surface-hover',
      )}
    >
      <div className="flex gap-3">
        <span className={cn('mt-0.5 shrink-0', selected ? 'text-accent-text' : 'text-text-muted')}>{icon}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <span className={cn('block text-base font-semibold leading-tight', selected ? 'text-accent-text' : 'text-text-primary')}>
            {title}
          </span>
          <p className="text-sm leading-relaxed text-text-muted">{description}</p>
        </div>
      </div>
    </button>
  );
}
