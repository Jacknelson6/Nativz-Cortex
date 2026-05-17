/**
 * CUP-03 T06: review-specific compact post list. Per T01 decision we do not
 * extract the share-link PostCard (it lives inside a 5733-line monolith);
 * instead this is a simpler review chrome that renders the same data shape.
 *
 * Each card shows: cover thumb, title, scheduled time, comment count,
 * caption preview, and an Edit chip that links to the existing post editor
 * with `?return=review&dropId=<id>&postId=<id>` so T07 can route the save
 * action back to the review surface.
 */

import Link from 'next/link';
import Image from 'next/image';
import { MessageSquare, Pencil, Calendar } from 'lucide-react';

export interface ReviewPost {
  id: string;
  title: string;
  caption: string | null;
  scheduledAt: string | null;
  coverImageUrl: string | null;
  commentCount: number;
}

interface PostListWithEditProps {
  dropId: string;
  posts: ReviewPost[];
  /** Optional override for the editor return path (default /admin/calendar/<dropId>). */
  editorBasePath?: string;
}

function fmtScheduled(iso: string | null): string {
  if (!iso) return 'Time pending';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Time pending';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function captionPreview(caption: string | null): string {
  if (!caption) return 'No caption yet';
  const flat = caption.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return 'No caption yet';
  return flat.length > 200 ? `${flat.slice(0, 200)}...` : flat;
}

export function PostListWithEdit({ dropId, posts, editorBasePath }: PostListWithEditProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center text-sm text-text-muted">
        No posts yet for this drop.
      </div>
    );
  }

  const base = editorBasePath ?? `/admin/calendar/${dropId}`;

  return (
    <ol className="flex flex-col gap-3">
      {posts.map((post, i) => {
        const editHref = `${base}?return=review&dropId=${dropId}&postId=${post.id}#post-${post.id}`;
        return (
          <li
            key={post.id}
            id={`post-${post.id}`}
            className="rounded-xl border border-nativz-border bg-surface p-4"
          >
            <div className="flex gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-background/40 ring-1 ring-nativz-border">
                {post.coverImageUrl ? (
                  <Image
                    src={post.coverImageUrl}
                    alt={post.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
                    No cover
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-muted">Post {i + 1}</p>
                    <h3 className="mt-0.5 truncate text-sm font-medium text-text-primary">
                      {post.title}
                    </h3>
                  </div>
                  <Link
                    href={editHref}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-nativz-border bg-background/40 px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent-text hover:text-accent-text"
                  >
                    <Pencil size={12} />
                    Edit
                  </Link>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {fmtScheduled(post.scheduledAt)}
                  </span>
                  {post.commentCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={12} />
                      {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <p className="mt-2 line-clamp-3 text-sm leading-snug text-text-secondary">
                  {captionPreview(post.caption)}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
