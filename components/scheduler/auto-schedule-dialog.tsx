'use client';

import { useState, useMemo } from 'react';
import { Wand2, Loader2, CheckCircle2, AlertCircle, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { ConnectedProfile, MediaItem } from './types';
import { PLATFORM_ICONS } from './types';

interface AutoScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  profiles: ConnectedProfile[];
  media: MediaItem[];
  onComplete: () => void;
}

type Step = 'configure' | 'processing' | 'done';

interface ProcessingResult {
  media_id: string;
  post_id: string;
  scheduled_at: string;
  status: 'success' | 'error';
  error?: string;
}

export function AutoScheduleDialog({
  open,
  onClose,
  clientId,
  clientName,
  profiles,
  media,
  onComplete,
}: AutoScheduleDialogProps) {
  const unusedMedia = useMemo(() => media.filter(m => !m.is_used), [media]);

  const today = new Date();
  const twoWeeksOut = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(today.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(twoWeeksOut.toISOString().split('T')[0]);
  const [customPostsPerWeek, setCustomPostsPerWeek] = useState<number | null>(null);
  const [postingTime, setPostingTime] = useState('12:00');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>(profiles.map(p => p.id));
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(unusedMedia.map(m => m.id));

  const weeksInRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.max(1, diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays / 7);
  }, [startDate, endDate]);

  const autoPostsPerWeek = useMemo(() => {
    return Math.min(7, Math.ceil(selectedMediaIds.length / weeksInRange));
  }, [selectedMediaIds.length, weeksInRange]);

  const postsPerWeek = customPostsPerWeek ?? autoPostsPerWeek;
  const isCustomFrequency = customPostsPerWeek !== null;
  const postsPerDay = postsPerWeek / 7;
  const highVolume = postsPerDay > 2;

  const [step, setStep] = useState<Step>('configure');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ProcessingResult[]>([]);

  function toggleProfile(id: string) {
    setSelectedProfiles(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function toggleMedia(id: string) {
    setSelectedMediaIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }

  function toggleAllMedia() {
    if (selectedMediaIds.length === unusedMedia.length) {
      setSelectedMediaIds([]);
    } else {
      setSelectedMediaIds(unusedMedia.map(m => m.id));
    }
  }

  async function handleAutoSchedule() {
    if (selectedProfiles.length === 0) {
      toast.error('Select at least one platform');
      return;
    }
    if (selectedMediaIds.length === 0) {
      toast.error('Select at least one media item');
      return;
    }

    setStep('processing');
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 2, 90));
      }, 500);

      const res = await fetch('/api/scheduler/auto-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          start_date: startDate,
          end_date: endDate,
          posts_per_week: postsPerWeek,
          posting_time: postingTime,
          platform_profile_ids: selectedProfiles,
          media_ids: selectedMediaIds,
        }),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Auto schedule failed');
      }

      const data = await res.json();
      setResults(data.results ?? []);
      setProgress(100);
      setStep('done');

      if (data.scheduled > 0) {
        toast.success(`${data.scheduled} post${data.scheduled > 1 ? 's' : ''} scheduled`);
      }
      if (data.errors > 0) {
        toast.error(`${data.errors} post${data.errors > 1 ? 's' : ''} failed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Auto schedule failed');
      setStep('configure');
    }
  }

  function handleDone() {
    onComplete();
    onClose();
    setStep('configure');
    setResults([]);
    setProgress(0);
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (step === 'processing') return;
        if (step === 'done') {
          handleDone();
        } else {
          onClose();
        }
      }}
      title=""
      maxWidth="lg"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 px-5 py-3 pr-14 border-b border-nativz-border">
        <Wand2 size={16} className="text-accent-text" />
        <h2 className="text-base font-semibold text-text-primary">Auto schedule</h2>
      </div>

      {step === 'configure' && (
        <>
          <div className="flex-1 overflow-y-auto max-h-[60vh]">
            <div className="p-5 space-y-5">
              <p className="text-xs text-text-muted">
                Automatically schedule {selectedMediaIds.length} video{selectedMediaIds.length !== 1 ? 's' : ''} for <strong className="text-text-primary">{clientName}</strong> with AI-generated captions.
              </p>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-text-muted">Media to schedule</label>
                  <button onClick={toggleAllMedia} className="text-[10px] text-accent-text cursor-pointer hover:underline">
                    {selectedMediaIds.length === unusedMedia.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                {unusedMedia.length === 0 ? (
                  <p className="text-xs text-text-muted py-4 text-center">No unused media. Upload videos first.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {unusedMedia.map(item => (
                      <button
                        key={item.id}
                        onClick={() => toggleMedia(item.id)}
                        className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
                          selectedMediaIds.includes(item.id)
                            ? 'border-accent-text'
                            : 'border-transparent opacity-50'
                        }`}
                      >
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt={item.filename} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-surface-hover flex items-center justify-center">
                            <Film size={14} className="text-text-muted" />
                          </div>
                        )}
                        {selectedMediaIds.includes(item.id) && (
                          <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-accent-text flex items-center justify-center">
                            <CheckCircle2 size={10} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 flex items-center gap-1.5">
                    Posts per week
                    <span className="text-[10px] text-text-muted/60">
                      ({isCustomFrequency ? 'custom' : 'auto-calculated'})
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={postsPerWeek}
                      onChange={e => {
                        const val = Math.min(7, Math.max(1, Number(e.target.value) || 1));
                        setCustomPostsPerWeek(val === autoPostsPerWeek ? null : val);
                      }}
                      className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary"
                    />
                    {isCustomFrequency && (
                      <button
                        onClick={() => setCustomPostsPerWeek(null)}
                        className="text-[10px] text-accent-text cursor-pointer hover:underline whitespace-nowrap"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Posting time</label>
                  <input
                    type="time"
                    value={postingTime}
                    onChange={e => setPostingTime(e.target.value)}
                    className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary"
                  />
                </div>
              </div>

              {highVolume && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
                  <p className="text-xs text-amber-400">
                    High volume — more than 2 posts/day. Consider extending the date range.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Post to</label>
                <div className="flex flex-wrap gap-2">
                  {profiles.length === 0 ? (
                    <p className="text-xs text-text-muted">No accounts connected.</p>
                  ) : (
                    profiles.map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => toggleProfile(profile.id)}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors cursor-pointer ${
                          selectedProfiles.includes(profile.id)
                            ? 'border-accent-text bg-accent-surface text-accent-text'
                            : 'border-nativz-border text-text-muted hover:border-text-secondary'
                        }`}
                      >
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-surface-hover" />
                        )}
                        <span>{profile.username}</span>
                        <span className="text-[10px] opacity-60">{PLATFORM_ICONS[profile.platform]}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-accent-surface/30 border border-accent-text/20 p-3">
                <p className="text-xs text-text-secondary">
                  <strong>{selectedMediaIds.length}</strong> video{selectedMediaIds.length !== 1 ? 's' : ''} across{' '}
                  <strong>{Math.round(weeksInRange * 10) / 10}</strong> week{weeksInRange !== 1 ? 's' : ''} = <strong>{postsPerWeek}x/week</strong> on{' '}
                  <strong>{selectedProfiles.length}</strong> platform{selectedProfiles.length !== 1 ? 's' : ''} at <strong>{postingTime}</strong>.
                  AI will generate unique captions matching your brand style.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-nativz-border">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleAutoSchedule}
              disabled={selectedMediaIds.length === 0 || selectedProfiles.length === 0}
            >
              <Wand2 size={14} />
              Auto schedule {selectedMediaIds.length} post{selectedMediaIds.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div className="p-8 flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-accent-text" />
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">Scheduling posts...</p>
            <p className="text-xs text-text-muted mt-1">
              Generating AI captions and scheduling {selectedMediaIds.length} post{selectedMediaIds.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-text transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-muted">{progress}%</p>
        </div>
      )}

      {step === 'done' && (
        <>
          <div className="p-8 flex flex-col items-center gap-4">
            <CheckCircle2 size={32} className="text-green-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">Auto schedule complete</p>
              <p className="text-xs text-text-muted mt-1">
                {results.filter(r => r.status === 'success').length} post{results.filter(r => r.status === 'success').length !== 1 ? 's' : ''} scheduled successfully
                {results.filter(r => r.status === 'error').length > 0 && (
                  <>, {results.filter(r => r.status === 'error').length} failed</>
                )}
              </p>
            </div>

            <div className="w-full space-y-1.5 max-h-40 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-hover px-3 py-2">
                  {r.status === 'success' ? (
                    <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                  ) : (
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                  )}
                  <span className="text-xs text-text-secondary truncate flex-1">
                    {r.status === 'success'
                      ? `Scheduled for ${new Date(r.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                      : r.error ?? 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end px-5 py-3 border-t border-nativz-border">
            <Button size="sm" onClick={handleDone}>View calendar</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
