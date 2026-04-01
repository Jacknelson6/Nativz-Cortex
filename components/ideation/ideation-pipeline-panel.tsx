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

  const step1Done = true;
  const step2Done = linkedIdeas.length > 0;

  return (
    <Card className="border-accent/20 bg-gradient-to-br from-accent/5 via-transparent to-accent2/5">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers size={18} className="text-accent" />
          Ideation pipeline
        </CardTitle>
      </div>

      <div className="mt-5 space-y-0">
        {/* Step 1: Topic search */}
        <StepperItem
          step={1}
          title="Topic search"
          done={step1Done}
          active
          isLast={false}
        >
          <p className="text-[11px] text-text-muted leading-snug truncate max-w-xs" title={query}>
            &ldquo;{query}&rdquo;
          </p>
          <Link
            href="/admin/search/new"
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-accent-text hover:underline"
          >
            <Plus size={11} />
            Add another search
          </Link>
        </StepperItem>

        {/* Step 2: Choose path */}
        <StepperItem
          step={2}
          title="Generate ideas"
          done={step2Done}
          active={step1Done}
          isLast={!selectedPath}
        >
          {step2Done ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-emerald-400">
                {linkedIdeas[0]?.count ?? 0} ideas generated
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/ideas/${linkedIdeas[0].id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text hover:underline"
                >
                  View ideas <ChevronRight size={11} />
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={onOpenIdeasWizard}
                >
                  Generate more
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-text-muted">Choose how to create video ideas from this research</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <PathCard
                  selected={selectedPath === 'pillars'}
                  onClick={() => setSelectedPath(selectedPath === 'pillars' ? null : 'pillars')}
                  icon={<GitBranch size={15} />}
                  title="Content pillars"
                  description="Align existing pillars to topics, or let AI create new ones and generate ideas"
                />
                <PathCard
                  selected={selectedPath === 'chat'}
                  onClick={() => setSelectedPath(selectedPath === 'chat' ? null : 'chat')}
                  icon={<MessageSquareText size={15} />}
                  title="Chat with the data"
                  description="Explore the research conversationally and surface ideas through dialogue"
                />
              </div>
            </div>
          )}
        </StepperItem>

        {/* Step 2 sub-steps when a path is chosen and not yet done */}
        {selectedPath && !step2Done ? (
          selectedPath === 'pillars' ? (
            <StepperItem
              step={null}
              title=""
              done={false}
              active
              isLast
              indent
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent-text shrink-0">a</span>
                  <p className="text-[11px] text-text-secondary leading-snug">
                    Align existing content pillars to your topic searches and generate new video ideas
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent2/20 text-[9px] font-bold text-accent2-text shrink-0">b</span>
                  <p className="text-[11px] text-text-secondary leading-snug">
                    Create new content pillars based on AI recommendations and generate ideas from them
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="h-8 text-xs gap-1.5 mt-1"
                  onClick={onOpenIdeasWizard}
                >
                  <Sparkles size={13} />
                  Create ideas
                </Button>
              </div>
            </StepperItem>
          ) : (
            <StepperItem
              step={null}
              title=""
              done={false}
              active
              isLast
              indent
            >
              <div className="space-y-2">
                <p className="text-[11px] text-text-secondary leading-snug">
                  Ask questions about the research, explore angles, and discover ideas through conversation.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/search/${searchId}/chat`}>
                    <Button type="button" variant="primary" size="sm" className="h-8 text-xs gap-1.5">
                      <MessageSquareText size={13} />
                      Open chat
                    </Button>
                  </Link>
                  <Link
                    href="/admin/search/new"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-accent-text"
                  >
                    <Search size={11} />
                    Add more searches
                  </Link>
                </div>
              </div>
            </StepperItem>
          )
        ) : null}
      </div>
    </Card>
  );
}

function StepperItem({
  step,
  title,
  done,
  active,
  isLast,
  indent = false,
  children,
}: {
  step: number | null;
  title: string;
  done: boolean;
  active: boolean;
  isLast: boolean;
  indent?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn('relative flex gap-3', indent && 'ml-5')}>
      {/* Vertical connector line */}
      <div className="flex flex-col items-center shrink-0">
        {step !== null ? (
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold shrink-0 transition-colors',
              done
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : active
                  ? 'border-accent/40 bg-accent/10 text-accent-text'
                  : 'border-nativz-border bg-surface-hover text-text-muted',
            )}
          >
            {done ? <Check size={14} /> : step}
          </div>
        ) : (
          <div className="h-2 w-7" />
        )}
        {!isLast && (
          <div className={cn(
            'w-px flex-1 min-h-4',
            done ? 'bg-emerald-500/30' : 'bg-nativz-border',
          )} />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0 pb-5', isLast && 'pb-0')}>
        {title ? (
          <p className={cn(
            'text-xs font-semibold leading-7',
            done ? 'text-emerald-400' : active ? 'text-text-primary' : 'text-text-muted',
          )}>
            {title}
          </p>
        ) : null}
        {children}
      </div>
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
        'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all cursor-pointer',
        selected
          ? 'border-accent/50 bg-accent/10 shadow-sm shadow-accent/10'
          : 'border-nativz-border bg-surface/60 hover:border-accent/30 hover:bg-surface-hover/60',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('shrink-0', selected ? 'text-accent-text' : 'text-text-muted')}>
          {icon}
        </span>
        <span className={cn('text-xs font-semibold', selected ? 'text-accent-text' : 'text-text-primary')}>
          {title}
        </span>
      </div>
      <p className="text-[10px] leading-snug text-text-muted">{description}</p>
    </button>
  );
}
