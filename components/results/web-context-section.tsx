'use client';

import { useState } from 'react';
import {
  Globe, MessageSquare, ExternalLink, ChevronDown, ChevronUp,
  ArrowUpRight, Hash, Users, ThumbsUp,
} from 'lucide-react';

interface SerpSnippet {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

interface RedditThread {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  selftext: string;
  topComments: string[];
  createdUtc: number;
}

interface WebContextSectionProps {
  serpResults: SerpSnippet[];
  redditThreads: RedditThread[];
}

function timeAgo(utc: number): string {
  const diff = Date.now() / 1000 - utc;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

function RedditThreadCard({ thread }: { thread: RedditThread }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-nativz-border bg-background/30 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <a
            href={thread.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-text-primary hover:text-accent-text transition-colors line-clamp-2"
          >
            {thread.title}
          </a>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Hash size={12} />
              r/{thread.subreddit}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp size={12} />
              {thread.score}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {thread.numComments}
            </span>
            <span>{timeAgo(thread.createdUtc)}</span>
          </div>
        </div>
        <a
          href={thread.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-text-muted hover:text-text-secondary"
        >
          <ArrowUpRight size={14} />
        </a>
      </div>

      {thread.selftext && (
        <p className="text-xs text-text-secondary line-clamp-2">
          {thread.selftext}
        </p>
      )}

      {thread.topComments.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {thread.topComments.length} top comment{thread.topComments.length > 1 ? 's' : ''}
          </button>
          {expanded && (
            <div className="space-y-2 pl-3 border-l-2 border-nativz-border">
              {thread.topComments.map((comment, i) => (
                <p key={i} className="text-xs text-text-secondary leading-relaxed">
                  {comment}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WebContextSection({ serpResults, redditThreads }: WebContextSectionProps) {
  if (serpResults.length === 0 && redditThreads.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* Reddit threads */}
      {redditThreads.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <MessageSquare size={16} className="text-orange-400" />
              Reddit discussions
            </h3>
            <span className="text-xs text-text-muted">
              {redditThreads.length} thread{redditThreads.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {redditThreads.map((thread, i) => (
              <RedditThreadCard key={i} thread={thread} />
            ))}
          </div>
        </div>
      )}

      {/* SERP results */}
      {serpResults.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Globe size={16} className="text-cyan-400" />
              Web landscape
            </h3>
            <span className="text-xs text-text-muted">
              {serpResults.length} result{serpResults.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1.5">
            {serpResults.map((result, i) => (
              <a
                key={i}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-hover transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary group-hover:text-accent-text transition-colors line-clamp-1">
                    {result.title}
                  </p>
                  <p className="text-xs text-text-muted line-clamp-1 mt-0.5">
                    {result.snippet}
                  </p>
                </div>
                <ExternalLink size={12} className="shrink-0 text-text-muted mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
