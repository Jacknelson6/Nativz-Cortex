# PRD 07: Comment thread parity across calendar and editing

## Problem

The calendar share page and the editing share page render comments using two divergent inline implementations. Visual treatments differ. Reply behavior differs subtly. Resolve toggles look different. Attachment chips render in different positions. The two pages have drifted for months because every change shipped twice.

## Goal

Extract a single comment-thread component that both share pages use, with prop variants for the two contexts (frame-pinned timestamps in editing, scheduled-time chrome in calendar). Same visual language, same interactions, same accessibility.

## Scope

A new shared component plus refactors of both share pages to consume it. No new feature behavior beyond what PRDs 01, 05, and 06 introduce; this PRD is the consolidation.

## Spec

### Shared component

Proposal: `components/share/comment-thread.tsx`.

Props:

```ts
type CommentThreadProps = {
  surface: 'calendar' | 'editing';
  comments: SharedComment[];
  currentUser: { role: 'admin' | 'viewer' | 'guest'; displayName: string; userId: string | null };
  capabilities: { canResolve: boolean; canReply: boolean; canMarkRevision: boolean };
  onPost: (input: { kind: CommentKind; body: string; replyToId?: string; attachments?: Attachment[]; timestampSeconds?: number }) => Promise<void>;
  onResolveToggle: (commentId: string, resolved: boolean) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>; // admin only
};
```

`SharedComment` carries `kind`, `author_role`, `author_name`, `author_avatar_url`, `body`, `attachments`, `timestamp_seconds`, `resolved_at`, `parent_comment_id`, `created_at`.

### Visual rules

- Three kind treatments rendered identically across both surfaces (revision, feedback, admin_response).
- Approval and video_revised render as compact event lines, not full cards.
- Reply nesting: one level. A reply to a reply still attaches to the parent revision or feedback.
- Avatars: admin chip uses the admin's avatar; viewer and guest fall back to initials disks.
- Timestamps: relative ("3h"), with full timestamp on hover.
- Frame-pinned indicator (editing only): clicking the chip scrubs the video to that second.
- Empty state: identical copy and illustration across surfaces.

### Interactions

- Resolve / unresolve: only on `kind = 'revision'`, only when `capabilities.canResolve` is true (admin in agency).
- Delete: admin only, with confirm dialog. Soft delete sets a `deleted_at` column (add via migration in this PRD).
- Reply: any role can reply. The reply inherits no kind by default; reply default is feedback.
- Attachment upload: identical paths on both surfaces; image/video/PDF up to existing limits.

### Pagination

If a thread exceeds 50 comments, show the latest 20 with "load earlier comments." Same threshold both surfaces.

### Accessibility

- Composer textarea has a labelled affordance for the kind toggle.
- Each comment is an article with a header containing author and timestamp.
- Resolve and delete actions are buttons (not icon-only divs) with text labels in screen-reader content.
- Focus management on reply: focus moves to the reply composer; closing returns focus to the trigger.

## Migration

Add `deleted_at timestamptz null` to both comment tables. Hide rows with `deleted_at is not null` from the thread. Admins can see a "deleted" placeholder if useful, behind a toggle ("show deleted"), optional, do not block on this.

## Acceptance

- Calendar and editing share pages import the same component.
- All three kinds render identically across both surfaces.
- Frame-pinned chip works in editing, hidden in calendar.
- One-level reply works on both.
- Admin delete works on both with soft-delete and audit log entry.
- Accessibility checks pass on the shared component in isolation.

## Out of scope

- Reactions (emoji thumbs).
- Inline edit of an existing comment.
- Threaded replies beyond one level.
- A separate comment-thread surface in admin (re-using this component there is fine but not required).

## Dependencies

PRD 01, PRD 05, PRD 06.
