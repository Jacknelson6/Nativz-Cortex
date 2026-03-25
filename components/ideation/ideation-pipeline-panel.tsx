'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  Circle,
  Clapperboard,
  Film,
  Layers,
  Loader2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

export function IdeationPipelinePanel({
  searchId,
  query,
  videoCandidateCount,
  linkedBoards,
  linkedIdeas,
  onOpenIdeasWizard,
}: IdeationPipelinePanelProps) {
  const router = useRouter();
  const [building, setBuilding] = useState(false);

  async function handleBuildBoard() {
    setBuilding(true);
    try {
      const res = await fetch('/api/analysis/boards/from-topic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_id: searchId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not create board');
        return;
      }
      toast.success(`Added ${data.items_created ?? 0} clips to a new board`);
      router.push(`/admin/analysis/${data.board_id}`);
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setBuilding(false);
    }
  }

  const step1Done = true;
  const step2Done = linkedBoards.length > 0;
  const step3Done = linkedIdeas.length > 0;

  return (
    <Card className="border-accent/20 bg-gradient-to-br from-accent/5 via-transparent to-accent2/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers size={18} className="text-accent" />
            Ideation pipeline
          </CardTitle>
        </div>
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PipelineStep
          step={1}
          title="Topic research"
          description={`“${query}”`}
          done={step1Done}
          icon={<Film size={16} />}
          descriptionSingleLine
        />
        <PipelineStep
          step={2}
          title="Inspiration board"
          description={
            videoCandidateCount > 0
              ? `${videoCandidateCount} video URLs ready`
              : 'Run multi-platform research for TikTok / YouTube URLs'
          }
          done={step2Done}
          icon={<Clapperboard size={16} />}
          actions={
            <>
              {linkedBoards.length > 0 ? (
                <Link
                  href={`/admin/analysis/${linkedBoards[0].id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text hover:underline"
                >
                  Open board
                  <ArrowRight size={12} />
                </Link>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={videoCandidateCount === 0 || building}
                  onClick={handleBuildBoard}
                >
                  {building ? <Loader2 size={12} className="animate-spin" /> : null}
                  Build from research
                </Button>
              )}
            </>
          }
        />
        <PipelineStep
          step={3}
          title="Video ideas"
          description={step3Done ? `${linkedIdeas[0]?.count ?? 0} ideas generated` : 'Ground ideas in this search'}
          done={step3Done}
          icon={<Sparkles size={16} />}
          actions={
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenIdeasWizard}>
              {step3Done ? 'Generate more' : 'Create ideas'}
            </Button>
          }
        />
        <PipelineStep
          step={4}
          title="Scripts & production"
          description={step3Done ? 'Generate scripts on the ideas page' : 'Complete step 3 first'}
          done={false}
          icon={<Sparkles size={16} />}
          actions={
            step3Done ? (
              <Link
                href={`/admin/ideas/${linkedIdeas[0].id}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-accent-text"
              >
                Open ideas → scripts
                <ArrowRight size={12} />
              </Link>
            ) : null
          }
        />
      </ol>
    </Card>
  );
}

function PipelineStep({
  step,
  title,
  description,
  done,
  icon,
  actions,
  descriptionSingleLine = false,
}: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  icon: ReactNode;
  actions?: ReactNode;
  /** Topic query: keep on one line; scroll horizontally if needed (grid columns are narrow). */
  descriptionSingleLine?: boolean;
}) {
  return (
    <li className="min-w-0 rounded-xl border border-nativz-border bg-surface/80 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold shrink-0 ${
            done
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : 'border-nativz-border bg-surface-hover text-text-muted'
          }`}
        >
          {done ? <Check size={14} /> : <Circle size={14} className="opacity-40" />}
        </span>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-text-muted shrink-0">{icon}</span>
          <span className="text-xs font-semibold text-text-primary truncate">
            {step}. {title}
          </span>
        </div>
      </div>
      <div className="min-w-0 pl-9">
        {descriptionSingleLine ? (
          /* w-max so the line sizes to the full string; parent clips + scrolls (grid min-content was clipping mid-glyph). */
          <div className="overflow-x-auto overflow-y-hidden" title={description}>
            <p className="m-0 w-max max-w-none whitespace-nowrap text-[11px] text-text-muted leading-snug">
              {description}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-text-muted leading-snug">{description}</p>
        )}
      </div>
      {actions ? <div className="pl-9 flex flex-col gap-1.5 items-start">{actions}</div> : null}
    </li>
  );
}
