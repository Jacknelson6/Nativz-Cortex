'use client';

import { useState, useCallback, useEffect } from 'react';
import { Flame, Search, Plus, ExternalLink, Eye, Heart, Clock, X } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface ViralResult {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  author: string;
  platform: 'tiktok' | 'youtube' | 'instagram';
  views: number;
  likes: number;
  duration: number | null;
}

interface Board {
  id: string;
  name: string;
}

const PLATFORM_COLORS = {
  tiktok: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  youtube: 'bg-red-500/20 text-red-400 border-red-500/30',
  instagram: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const PLATFORM_LABELS = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ResultCard({
  item,
  onAddToBoard,
}: {
  item: ViralResult;
  onAddToBoard: (item: ViralResult) => void;
}) {
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:shadow-[0_0_30px_rgba(4,107,210,0.08)]">
      {/* Thumbnail */}
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block relative aspect-[9/16] max-h-[320px] overflow-hidden bg-black/40">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <Flame size={48} />
          </div>
        )}
        {/* Duration badge */}
        {item.duration && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(item.duration)}
          </span>
        )}
        {/* Platform badge */}
        <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PLATFORM_COLORS[item.platform]}`}>
          {PLATFORM_LABELS[item.platform]}
        </span>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ExternalLink size={24} className="text-white" />
        </div>
      </a>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-sm font-medium text-white/90 line-clamp-2 leading-snug">{item.title}</p>
        <p className="text-xs text-white/50">@{item.author}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1"><Eye size={12} />{formatCount(item.views)}</span>
            {item.likes > 0 && (
              <span className="flex items-center gap-1"><Heart size={12} />{formatCount(item.likes)}</span>
            )}
          </div>
          <button
            onClick={() => onAddToBoard(item)}
            className="p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent-text transition-colors"
            title="Add to Board"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.06]">
      <Skeleton className="aspect-[9/16] max-h-[320px] w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

function BoardPicker({
  boards,
  onSelect,
  onClose,
  loading,
}: {
  boards: Board[];
  onSelect: (boardId: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0d1117] border border-white/10 rounded-2xl p-5 w-full max-w-sm max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Add to Board</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : boards.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">No boards yet. Create one first.</p>
        ) : (
          <div className="space-y-1 overflow-y-auto">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelect(b.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/[0.06] transition-colors"
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ViralLibraryPage() {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'all' | 'tiktok' | 'youtube'>('all');
  const [results, setResults] = useState<ViralResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Board picker state
  const [pickerItem, setPickerItem] = useState<ViralResult | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [addingToBoard, setAddingToBoard] = useState(false);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: query, platform, limit: '30' });
      const res = await fetch(`/api/moodboard/viral-library?${params}`);
      const json = await res.json();
      setResults(json.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, platform]);

  const openBoardPicker = useCallback(async (item: ViralResult) => {
    setPickerItem(item);
    setBoardsLoading(true);
    try {
      const res = await fetch('/api/moodboard/boards');
      const json = await res.json();
      setBoards(Array.isArray(json) ? json : json.boards || []);
    } catch {
      setBoards([]);
    } finally {
      setBoardsLoading(false);
    }
  }, []);

  const addToBoard = useCallback(async (boardId: string) => {
    if (!pickerItem) return;
    setAddingToBoard(true);
    try {
      await fetch('/api/moodboard/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          url: pickerItem.url,
          type: 'video',
          title: pickerItem.title,
        }),
      });
    } catch {
      // silently fail
    } finally {
      setAddingToBoard(false);
      setPickerItem(null);
    }
  }, [pickerItem]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-orange-500/20">
              <Flame size={20} className="text-orange-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Viral Library</h1>
          </div>
          <p className="text-sm text-white/40">Discover trending content by niche and platform</p>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <Input
              placeholder="Search by niche... (fitness, restaurants, jewelry)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="pl-9 bg-white/[0.04] border-white/[0.08]"
            />
          </div>

          {/* Platform filter */}
          <div className="flex gap-1 bg-white/[0.04] rounded-xl border border-white/[0.06] p-1">
            {(['all', 'tiktok', 'youtube'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  platform === p
                    ? 'bg-accent/20 text-accent-text'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {p === 'all' ? 'All' : PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          <GlassButton onClick={doSearch} loading={loading}>
            <Search size={16} />
            Search
          </GlassButton>
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {results.map((item) => (
              <ResultCard key={item.id} item={item} onAddToBoard={openBoardPicker} />
            ))}
          </div>
        ) : searched ? (
          <div className="text-center py-20">
            <Flame size={48} className="mx-auto text-white/10 mb-4" />
            <p className="text-white/40">No results found. Try a different search term.</p>
          </div>
        ) : (
          <div className="text-center py-20">
            <Flame size={48} className="mx-auto text-white/10 mb-4" />
            <p className="text-white/40">Search for a niche to discover viral content</p>
          </div>
        )}
      </div>

      {/* Board Picker Modal */}
      {pickerItem && (
        <BoardPicker
          boards={boards}
          onSelect={addToBoard}
          onClose={() => setPickerItem(null)}
          loading={boardsLoading}
        />
      )}
    </div>
  );
}
