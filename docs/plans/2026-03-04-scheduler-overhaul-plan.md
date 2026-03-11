# Scheduler Overhaul — Late API Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing scheduler UI to the Late API so posts actually publish, media uploads go through Late's presigned URLs, and social accounts connect via Late OAuth.

**Architecture:** Thin wrapper over Late API. Late is source of truth for publishing state. Our Supabase DB stores client-to-profile mappings and local metadata. The existing `LatePostingService` in `lib/posting/late.ts` already has most methods — we extend it and wire the API routes + frontend to use it.

**Tech Stack:** Next.js 15, Late REST API (`https://getlate.dev/api/v1`), Supabase (Postgres), TypeScript, Zod

---

### Task 1: Install Late SDK and add env vars

**Files:**
- Modify: `package.json`
- Modify: `.env.local` (add vars)
- Modify: `lib/posting/late.ts` (switch to SDK if beneficial, or keep fetch wrapper)

**Step 1: Install the Late Node SDK**

Run: `npm install @getlatedev/social-media-api`

**Step 2: Add environment variables**

Add to `.env.local`:
```
LATE_API_KEY=sk_your_key_here
LATE_WEBHOOK_SECRET=whsec_your_secret_here
```

**Step 3: Verify Late SDK import works**

No code change needed yet — the existing `lib/posting/late.ts` already uses `fetch` against the Late API. We'll keep this pattern since it's already working and well-typed. The SDK is a backup.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Late SDK and add env var placeholders"
```

---

### Task 2: Add Late ID columns to database

**Files:**
- Create: `supabase/migrations/027_add_late_ids.sql`

**Step 1: Write the migration**

```sql
-- Add Late API reference IDs for sync
ALTER TABLE social_profiles ADD COLUMN IF NOT EXISTS late_account_id TEXT;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS late_post_id TEXT;
ALTER TABLE scheduler_media ADD COLUMN IF NOT EXISTS late_media_url TEXT;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_social_profiles_late_account_id ON social_profiles(late_account_id) WHERE late_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_late_post_id ON scheduled_posts(late_post_id) WHERE late_post_id IS NOT NULL;
```

**Step 2: Apply migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/027_add_late_ids.sql
git commit -m "feat: add Late API ID columns to social_profiles, scheduled_posts, scheduler_media"
```

---

### Task 3: Extend LatePostingService with analytics and media methods

**Files:**
- Modify: `lib/posting/late.ts` (add `getAnalytics`, `listPosts`, update `getMediaUploadUrl`)
- Modify: `lib/posting/types.ts` (add analytics types, extend `PostingService` interface)

**Step 1: Add analytics and listing types to `lib/posting/types.ts`**

Add after the existing types:

```typescript
export interface PostAnalytics {
  impressions: number;
  engagement: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  platform: SocialPlatform;
  date: string;
}

export interface AnalyticsQuery {
  accountId: string;
  startDate: string;
  endDate: string;
}

export interface ListPostsQuery {
  platform?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface LatePost {
  id: string;
  content: string;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  platforms: Array<{
    platform: string;
    accountId: string;
    status: string;
    platformPostUrl?: string;
    error?: string;
  }>;
  mediaItems?: Array<{ url: string; type: string }>;
  createdAt: string;
}
```

Extend the `PostingService` interface:

```typescript
export interface PostingService {
  // ... existing methods ...

  /** Get a presigned upload URL for media */
  getMediaUploadUrl(contentType?: string): Promise<{ uploadUrl: string; publicUrl: string }>;

  /** List posts from Late */
  listPosts(query?: ListPostsQuery): Promise<LatePost[]>;

  /** Get analytics for an account */
  getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]>;

  /** Retry a failed post */
  retryPost(externalPostId: string): Promise<PublishResult>;
}
```

**Step 2: Implement the new methods in `lib/posting/late.ts`**

Add `listPosts` method:

```typescript
async listPosts(query?: ListPostsQuery): Promise<LatePost[]> {
  const params = new URLSearchParams();
  if (query?.platform) params.set('platform', query.platform);
  if (query?.status) params.set('status', query.status);
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.offset) params.set('offset', String(query.offset));
  const qs = params.toString();
  const { posts } = await lateRequest<{ posts: LatePost[] }>(
    `/posts${qs ? `?${qs}` : ''}`
  );
  return posts ?? [];
}
```

Add `getAnalytics` method:

```typescript
async getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]> {
  const params = new URLSearchParams({
    accountId: query.accountId,
    startDate: query.startDate,
    endDate: query.endDate,
  });
  const data = await lateRequest<{ analytics: PostAnalytics[] }>(
    `/analytics?${params}`
  );
  return data.analytics ?? [];
}
```

Update `getMediaUploadUrl` to accept contentType:

```typescript
async getMediaUploadUrl(contentType?: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  const params = contentType ? `?contentType=${encodeURIComponent(contentType)}` : '';
  return lateRequest<{ uploadUrl: string; publicUrl: string }>(
    `/media/get-media-presigned-url${params}`
  );
}
```

**Step 3: Commit**

```bash
git add lib/posting/late.ts lib/posting/types.ts
git commit -m "feat: extend LatePostingService with analytics, listing, and media methods"
```

---

### Task 4: Rewrite media upload API to use Late presigned URLs

**Files:**
- Modify: `app/api/scheduler/media/route.ts`

**Step 1: Rewrite POST handler**

Replace the Supabase Storage upload with a two-step flow:
1. Get presigned URL from Late
2. Return the `uploadUrl` and `publicUrl` to the frontend
3. Frontend uploads directly to Late's CDN
4. Frontend calls back to confirm upload and save DB record

New POST handler:

```typescript
// POST: Get a presigned upload URL from Late, or confirm upload
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action ?? 'get-upload-url';

  if (action === 'get-upload-url') {
    // Step 1: Get presigned URL from Late
    const service = getPostingService() as LatePostingService;
    const { uploadUrl, publicUrl } = await service.getMediaUploadUrl(body.contentType);
    return NextResponse.json({ uploadUrl, publicUrl });
  }

  if (action === 'confirm-upload') {
    // Step 2: Save DB record after frontend uploaded to Late
    const parsed = ConfirmUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const data = parsed.data;
    const adminClient = createAdminClient();

    const { data: media, error: dbError } = await adminClient
      .from('scheduler_media')
      .insert({
        client_id: data.client_id,
        uploaded_by: user.id,
        filename: data.filename,
        storage_path: '', // No Supabase storage path
        late_media_url: data.public_url,
        thumbnail_url: null,
        file_size_bytes: data.file_size_bytes,
        mime_type: data.mime_type,
        is_used: false,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: 'Failed to save media record' }, { status: 500 });
    }

    return NextResponse.json({ ...media, public_url: data.public_url });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
```

Add Zod schema:

```typescript
const ConfirmUploadSchema = z.object({
  client_id: z.string().uuid(),
  filename: z.string(),
  public_url: z.string().url(),
  file_size_bytes: z.number(),
  mime_type: z.string(),
});
```

**Step 2: Commit**

```bash
git add app/api/scheduler/media/route.ts
git commit -m "feat: switch media uploads to Late presigned URLs"
```

---

### Task 5: Update media library frontend for presigned URL uploads

**Files:**
- Modify: `components/scheduler/media-library.tsx`
- Modify: `components/scheduler/types.ts` (add `late_media_url` to `MediaItem`)

**Step 1: Add `late_media_url` to `MediaItem` type**

In `components/scheduler/types.ts`, add to `MediaItem`:

```typescript
late_media_url: string | null;
```

**Step 2: Rewrite upload handler in `media-library.tsx`**

Replace the XHR upload with a two-step flow:

```typescript
async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !clientId) return;

  setUploading(true);
  setUploadProgress(0);

  try {
    // Step 1: Get presigned URL from our API
    const urlRes = await fetch('/api/scheduler/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-upload-url', contentType: file.type }),
    });
    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, publicUrl } = await urlRes.json();

    // Step 2: Upload directly to Late CDN with progress
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    });

    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error('Upload to CDN failed'));
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });

    // Step 3: Confirm upload in our DB
    const confirmRes = await fetch('/api/scheduler/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm-upload',
        client_id: clientId,
        filename: file.name,
        public_url: publicUrl,
        file_size_bytes: file.size,
        mime_type: file.type,
      }),
    });
    if (!confirmRes.ok) throw new Error('Failed to save media record');

    toast.success('Media uploaded');
    onUploadComplete();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Upload failed');
  } finally {
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
}
```

**Step 3: Update file accept to include images**

Late supports images too. Update the file input:

```html
<input
  ref={fileInputRef}
  type="file"
  accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
  onChange={handleUpload}
  className="hidden"
/>
```

**Step 4: Update media grid to use `late_media_url` for thumbnails**

In the media grid, fall back to `late_media_url` when no `thumbnail_url`:

```tsx
{item.thumbnail_url || item.late_media_url ? (
  <img
    src={item.thumbnail_url ?? item.late_media_url ?? ''}
    alt={item.filename}
    className="w-full h-full object-cover"
    loading="lazy"
  />
) : (
  <div className="w-full h-full flex items-center justify-center">
    <Film size={20} className="text-text-muted" />
  </div>
)}
```

**Step 5: Commit**

```bash
git add components/scheduler/media-library.tsx components/scheduler/types.ts
git commit -m "feat: update media library to upload via Late presigned URLs"
```

---

### Task 6: Build account connection flow

**Files:**
- Create: `app/api/scheduler/connect/route.ts`
- Create: `app/api/scheduler/connect/callback/route.ts`
- Modify: `app/api/scheduler/profiles/route.ts` (read from Late API)

**Step 1: Create connect initiation endpoint**

`app/api/scheduler/connect/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPostingService } from '@/lib/posting';
import { z } from 'zod';
import type { SocialPlatform } from '@/lib/posting/types';

const ConnectSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube']),
  client_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const service = getPostingService();
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scheduler/connect/callback?client_id=${parsed.data.client_id}&platform=${parsed.data.platform}`;
  const result = await service.connectProfile({
    platform: parsed.data.platform as SocialPlatform,
    callbackUrl,
  });

  return NextResponse.json({ authUrl: result.authorizationUrl });
}
```

**Step 2: Create OAuth callback endpoint**

`app/api/scheduler/connect/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const platform = searchParams.get('platform');

  if (!clientId || !platform) {
    return NextResponse.redirect(new URL('/admin/scheduler?error=missing_params', request.url));
  }

  // After OAuth, Late will have added the account. Fetch updated profiles and sync to our DB.
  const service = getPostingService();
  const profiles = await service.getConnectedProfiles();
  const adminClient = createAdminClient();

  // Upsert profiles for this client
  for (const profile of profiles) {
    await adminClient
      .from('social_profiles')
      .upsert({
        client_id: clientId,
        platform: profile.platform,
        platform_user_id: profile.platformUserId,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        late_account_id: profile.id,
        is_active: profile.isActive,
      }, { onConflict: 'client_id,platform,platform_user_id' });
  }

  return NextResponse.redirect(new URL('/admin/scheduler?connected=true', request.url));
}
```

**Step 3: Update profiles GET to merge Late data**

Modify `app/api/scheduler/profiles/route.ts` to also store `late_account_id` and return it:

```typescript
// In the GET handler, after fetching from DB:
// Include late_account_id in the response so the frontend can reference it
const transformed = (data ?? []).map(p => ({
  id: p.id,
  platform: p.platform,
  username: p.username,
  avatar_url: p.avatar_url,
  late_account_id: p.late_account_id,
}));
```

**Step 4: Commit**

```bash
git add app/api/scheduler/connect/ app/api/scheduler/profiles/route.ts
git commit -m "feat: add social account connection flow via Late OAuth"
```

---

### Task 7: Wire post creation/update/delete to Late API

**Files:**
- Modify: `app/api/scheduler/posts/route.ts` (POST creates in Late + local DB)
- Modify or create: `app/api/scheduler/posts/[id]/route.ts` (PUT/DELETE syncs to Late)

**Step 1: Update POST handler to create in Late**

After creating the local DB record, also create in Late:

```typescript
// After inserting into scheduled_posts and linking platforms/media...
const service = getPostingService();

// Build media URLs from Late CDN
const mediaUrls = []; // Gather from linked scheduler_media.late_media_url

// Get late_account_ids for the selected profiles
const { data: profileRows } = await adminClient
  .from('social_profiles')
  .select('id, platform, late_account_id')
  .in('id', data.platform_profile_ids);

const platforms = (profileRows ?? [])
  .filter(p => p.late_account_id)
  .map(p => ({
    platform: p.platform,
    accountId: p.late_account_id,
  }));

if (platforms.length > 0) {
  const lateResult = await service.publishPost({
    videoUrl: mediaUrls[0] ?? '',
    caption: data.caption,
    hashtags: data.hashtags,
    platformProfileIds: platforms.map(p => p.accountId),
    platformHints: Object.fromEntries(platforms.map(p => [p.accountId, p.platform])),
    scheduledAt: data.scheduled_at ?? undefined,
    coverImageUrl: data.cover_image_url ?? undefined,
    taggedPeople: data.tagged_people,
    collaboratorHandles: data.collaborator_handles,
  });

  // Save Late post ID back to our record
  await adminClient
    .from('scheduled_posts')
    .update({ late_post_id: lateResult.externalPostId })
    .eq('id', post.id);
}
```

**Step 2: Update DELETE handler to also delete from Late**

```typescript
// Before deleting from local DB:
if (post.late_post_id) {
  const service = getPostingService();
  await service.deletePost(post.late_post_id).catch(err => {
    console.error('Failed to delete from Late:', err);
    // Continue with local delete even if Late fails
  });
}
```

**Step 3: Commit**

```bash
git add app/api/scheduler/posts/
git commit -m "feat: sync post create/delete with Late API"
```

---

### Task 8: Add webhook endpoint for Late status updates

**Files:**
- Create: `app/api/scheduler/webhooks/route.ts`

**Step 1: Create webhook handler**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  // Verify webhook signature if LATE_WEBHOOK_SECRET is set
  const secret = process.env.LATE_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get('x-late-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    // TODO: Verify HMAC signature against secret
  }

  const body = await request.json();
  const { event, data } = body;
  const adminClient = createAdminClient();

  switch (event) {
    case 'post.published': {
      await adminClient
        .from('scheduled_posts')
        .update({ status: 'published' })
        .eq('late_post_id', data.postId);
      break;
    }
    case 'post.failed': {
      await adminClient
        .from('scheduled_posts')
        .update({ status: 'failed' })
        .eq('late_post_id', data.postId);
      break;
    }
    case 'account.disconnected': {
      await adminClient
        .from('social_profiles')
        .update({ is_active: false })
        .eq('late_account_id', data.accountId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

**Step 2: Commit**

```bash
git add app/api/scheduler/webhooks/route.ts
git commit -m "feat: add Late webhook endpoint for post status updates"
```

---

### Task 9: Add "Connect account" UI to scheduler page

**Files:**
- Modify: `app/admin/scheduler/page.tsx` (add connect button)
- Create: `components/scheduler/connect-account-dialog.tsx`

**Step 1: Create the connect account dialog**

A simple dialog with platform buttons (Instagram, TikTok, YouTube, Facebook). Each button calls `/api/scheduler/connect` and redirects to the returned `authUrl`.

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📷' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
  { id: 'facebook', label: 'Facebook', icon: '📘' },
] as const;

interface ConnectAccountDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
}

export function ConnectAccountDialog({ open, onClose, clientId }: ConnectAccountDialogProps) {
  const [connecting, setConnecting] = useState<string | null>(null);

  async function handleConnect(platform: string) {
    setConnecting(platform);
    try {
      const res = await fetch('/api/scheduler/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, client_id: clientId }),
      });
      if (!res.ok) throw new Error('Failed to start connection');
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch {
      toast.error('Failed to connect account');
      setConnecting(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl border border-nativz-border p-6 w-96">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Connect account</h2>
        <div className="space-y-2">
          {PLATFORMS.map(({ id, label }) => (
            <Button
              key={id}
              variant="secondary"
              className="w-full justify-start"
              disabled={connecting !== null}
              onClick={() => handleConnect(id)}
            >
              {connecting === id ? 'Connecting...' : `Connect ${label}`}
            </Button>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-4" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Add connect button to scheduler header**

In `app/admin/scheduler/page.tsx`, add a "Connect" button next to "New post" that opens the dialog when no profiles exist, or shows connected count.

**Step 3: Commit**

```bash
git add components/scheduler/connect-account-dialog.tsx app/admin/scheduler/page.tsx
git commit -m "feat: add connect social account dialog to scheduler"
```

---

### Task 10: Add analytics API route for Late data

**Files:**
- Create: `app/api/scheduler/analytics/route.ts`

**Step 1: Create analytics endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import type { LatePostingService } from '@/lib/posting/late';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

  if (!clientId || !startDate || !endDate) {
    return NextResponse.json({ error: 'client_id, start, and end are required' }, { status: 400 });
  }

  // Get Late account IDs for this client
  const adminClient = createAdminClient();
  const { data: profiles } = await adminClient
    .from('social_profiles')
    .select('late_account_id, platform')
    .eq('client_id', clientId)
    .not('late_account_id', 'is', null);

  if (!profiles?.length) {
    return NextResponse.json({ analytics: [] });
  }

  // Fetch analytics from Late for each connected account
  const service = getPostingService() as LatePostingService;
  const allAnalytics = await Promise.all(
    profiles.map(async (p) => {
      const data = await service.getAnalytics({
        accountId: p.late_account_id!,
        startDate,
        endDate,
      }).catch(() => []);
      return data.map(d => ({ ...d, platform: p.platform }));
    })
  );

  return NextResponse.json({ analytics: allAnalytics.flat() });
}
```

**Step 2: Commit**

```bash
git add app/api/scheduler/analytics/route.ts
git commit -m "feat: add analytics endpoint pulling from Late API"
```

---

### Task 11: Type-check and integration test

**Files:** None new — verification only.

**Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. Fix any type issues found.

**Step 2: Lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Build**

Run: `npm run build`
Expected: Successful build.

**Step 4: Manual smoke test checklist**

1. Open `/admin/scheduler` — page loads, client selector works
2. Click "Connect" — dialog shows 4 platform buttons
3. Click "Media" — library panel opens
4. Upload a file — should get presigned URL, upload to Late CDN, confirm in DB
5. Create a new post with media + platform + scheduled time — should create in Late
6. Delete a post — should delete from Late
7. Calendar views render posts correctly

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type and lint issues from scheduler overhaul"
```

---

## Summary of changes

| Task | What | Files touched |
|------|------|---------------|
| 1 | Install SDK, env vars | package.json |
| 2 | DB migration for Late IDs | migrations/027 |
| 3 | Extend PostingService types + methods | lib/posting/* |
| 4 | Media upload → Late presigned URLs | api/scheduler/media |
| 5 | Frontend media library update | components/scheduler/media-library |
| 6 | Account connection OAuth flow | api/scheduler/connect/* |
| 7 | Post CRUD syncs to Late | api/scheduler/posts/* |
| 8 | Webhook endpoint | api/scheduler/webhooks |
| 9 | Connect account UI | components/scheduler/connect-account-dialog |
| 10 | Analytics endpoint | api/scheduler/analytics |
| 11 | Type-check + smoke test | verification |
