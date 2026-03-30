'use client';

import { useState, useCallback, useEffect } from 'react';
import { Instagram, Loader2, ArrowRight, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SocialResultsPost {
  id: string;
  image_url: string;
  is_generated: boolean;
  type: 'photo' | 'reel' | 'carousel';
  caption?: string | null;
}

interface SocialResultsProfile {
  handle: string;
  display_name: string;
  bio: string;
  profile_image: string | null;
  followers: number;
  following: number;
  posts_count: number;
  posts: SocialResultsPost[];
}

interface VisualizerData {
  presentationId: string;
  status: 'idle' | 'scraping' | 'generating' | 'done' | 'error';
  error_message?: string | null;
  before: SocialResultsProfile | null;
  after: SocialResultsProfile | null;
  timeline_months: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ProfileMockup({ profile, label, accent }: { profile: SocialResultsProfile; label: string; accent: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${accent}`}>
        {label}
      </div>
      <div className="p-4 space-y-4">
        {/* Profile header */}
        <div className="flex items-center gap-3">
          {profile.profile_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_image} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-nativz-border" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-pink-600/20 flex items-center justify-center text-pink-400 text-xl font-bold">
              {(profile.display_name || '?')[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text-primary truncate">{profile.display_name}</p>
            <p className="text-sm text-text-muted">@{profile.handle}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-around text-center border-y border-nativz-border py-3">
          <div>
            <p className="font-bold text-text-primary">{formatNumber(profile.posts_count)}</p>
            <p className="text-xs text-text-muted">Posts</p>
          </div>
          <div>
            <p className="font-bold text-text-primary">{formatNumber(profile.followers)}</p>
            <p className="text-xs text-text-muted">Followers</p>
          </div>
          <div>
            <p className="font-bold text-text-primary">{formatNumber(profile.following)}</p>
            <p className="text-xs text-text-muted">Following</p>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm text-text-secondary">{profile.bio}</p>
        )}

        {/* Grid */}
        {profile.posts.length > 0 && (
          <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
            {profile.posts.slice(0, 9).map((post) => (
              <div key={post.id} className="relative aspect-square bg-surface-hover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.image_url} alt="" className="h-full w-full object-cover" />
                {post.is_generated && (
                  <div className="absolute top-1 right-1 bg-pink-600/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    AI
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StrategyLabVisualizer({ clientId }: { clientId: string }) {
  const [handle, setHandle] = useState('');
  const [months, setMonths] = useState(3);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VisualizerData | null>(null);

  const generate = useCallback(async () => {
    if (!handle.trim()) return;
    setLoading(true);
    setData(null);
    try {
      // Create a presentation of type social_results, then trigger generation
      const createRes = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Visualizer: @${handle.replace('@', '')}`,
          type: 'social_results',
          client_id: clientId,
        }),
      });
      if (!createRes.ok) throw new Error('Failed to create visualizer');
      const { id: presId } = await createRes.json();

      // Trigger the social results generation
      const genRes = await fetch(`/api/presentations/${presId}/social-results/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagram_handle: handle.replace('@', ''),
          timeline_months: months,
        }),
      });
      if (!genRes.ok) throw new Error('Failed to start generation');

      // Poll for completion
      const poll = async (): Promise<void> => {
        const res = await fetch(`/api/presentations/${presId}`);
        if (!res.ok) throw new Error('Failed to fetch results');
        const pres = await res.json();
        const sr = pres.social_results_data;
        if (!sr) {
          await new Promise((r) => setTimeout(r, 3000));
          return poll();
        }
        if (sr.status === 'done' || sr.status === 'error') {
          setData({
            presentationId: presId,
            status: sr.status,
            error_message: sr.error_message,
            before: sr.before,
            after: sr.after,
            timeline_months: sr.timeline_months ?? months,
          });
          return;
        }
        setData({
          presentationId: presId,
          status: sr.status,
          error_message: null,
          before: sr.before,
          after: null,
          timeline_months: sr.timeline_months ?? months,
        });
        await new Promise((r) => setTimeout(r, 3000));
        return poll();
      };
      await poll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Visualization failed');
    } finally {
      setLoading(false);
    }
  }, [handle, months, clientId]);

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Social results visualizer</h3>
          <p className="text-sm text-text-muted mt-1">
            See what a client&apos;s Instagram could look like after working with you. Enter their handle and timeline.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Instagram size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
              placeholder="instagram_handle"
              className="w-full rounded-lg border border-nativz-border bg-background pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
            />
          </div>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary"
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
          </select>
          <Button onClick={generate} disabled={loading || !handle.trim()}>
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Eye size={16} className="mr-2" />}
            {loading ? 'Generating...' : 'Visualize'}
          </Button>
        </div>
      </div>

      {/* Status */}
      {data && data.status !== 'done' && data.status !== 'error' && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-accent-text" />
          <span className="text-sm text-text-secondary">
            {data.status === 'scraping' ? 'Scraping current profile...' : 'Generating projected results...'}
          </span>
        </div>
      )}

      {data?.status === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {data.error_message || 'Something went wrong during visualization.'}
        </div>
      )}

      {/* Before / After */}
      {data?.status === 'done' && data.before && data.after && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">
              @{data.before.handle} — {data.timeline_months} month projection
            </h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ProfileMockup profile={data.before} label="Current" accent="bg-surface-hover text-text-muted" />
            <ProfileMockup profile={data.after} label={`After ${data.timeline_months} months`} accent="bg-pink-600/15 text-pink-400" />
          </div>
          {/* Growth summary */}
          <div className="rounded-xl border border-nativz-border bg-surface p-4 flex gap-6">
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400">
                +{formatNumber(data.after.followers - data.before.followers)}
              </p>
              <p className="text-xs text-text-muted">New followers</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400">
                +{data.after.posts_count - data.before.posts_count}
              </p>
              <p className="text-xs text-text-muted">New posts</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-text-primary">
                {((data.after.followers / data.before.followers - 1) * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-text-muted">Growth</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
