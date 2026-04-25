import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { queueOnboardingNotification } from '@/lib/onboarding/queue-notification';
import { bumpPocActivityForTracker } from '@/lib/onboarding/poc-activity';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/public/link
 *
 * Lets the POC paste a cloud-storage URL (Drive, Dropbox, Box, anything)
 * instead of uploading a file. Records as a row in onboarding_uploads
 * with mime_type='link/external' and the URL stored in `note`. The admin
 * editor + the public list both just show the URL.
 *
 * Same share_token gate as upload + item-toggle.
 */
const Body = z.object({
  share_token: z.string().uuid(),
  url: z.string().url().max(1000),
  label: z.string().max(200).optional(),
  phase_id: z.string().uuid().optional().nullable(),
});

function deriveLabel(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    const lastPathSegment = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const display = lastPathSegment ? `${host} / ${decodeURIComponent(lastPathSegment).slice(0, 60)}` : host;
    return display.slice(0, 200);
  } catch {
    return rawUrl.slice(0, 200);
  }
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { share_token, url, label, phase_id } = parsed.data;
  const admin = createAdminClient();

  const { data: tracker } = await admin
    .from('onboarding_trackers')
    .select('id, status, is_template')
    .eq('share_token', share_token)
    .maybeSingle();
  if (!tracker || tracker.is_template || tracker.status === 'archived') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filename = label?.trim() || deriveLabel(url);
  const { data: row, error } = await admin
    .from('onboarding_uploads')
    .insert({
      tracker_id: tracker.id,
      storage_path: 'external://' + url,
      filename,
      mime_type: 'link/external',
      size_bytes: null,
      phase_id: phase_id ?? null,
      note: url,
      uploaded_by: 'client',
    })
    .select('id, filename, mime_type, size_bytes, note, uploaded_by, created_at')
    .single();
  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  await admin.from('onboarding_events').insert({
    tracker_id: tracker.id,
    kind: 'file_uploaded',
    phase_id: phase_id ?? null,
    metadata: { filename, link: url, upload_id: row.id, kind: 'external_link' },
    actor: 'client',
  });
  await queueOnboardingNotification(admin, tracker.id, {
    kind: 'file_uploaded',
    detail: filename,
  });
  await bumpPocActivityForTracker(admin, tracker.id);

  return NextResponse.json({ ok: true, upload: row });
}
