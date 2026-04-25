import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { queueOnboardingNotification } from '@/lib/onboarding/queue-notification';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Cap single-file uploads. Matches Next.js's default 10 MB client body limit
// — going bigger would need a next.config change AND a direct-to-storage
// signed-URL flow. For v1 this covers brand guides, logos, short clips.
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/onboarding/public/upload
 *
 * multipart/form-data:
 *   - share_token (string, required, uuid)
 *   - file        (File, required, up to 50MB)
 *   - phase_id    (string, optional — fulfil a specific phase)
 *   - note        (string, optional — client's own message)
 *
 * Validates the token, writes the file to the private onboarding-uploads
 * bucket under `onboarding/<tracker_id>/<upload_id>-<safename>`, and records
 * the row. Then fires the file-uploaded notification non-blocking.
 */
export async function POST(request: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      // Next.js truncates body over 10 MB and FormData parsing throws.
      // Turn that into a friendly 413 instead of bubbling a 500.
      console.error('upload formData parse error:', err);
      return NextResponse.json(
        { error: 'File is too large (10 MB max)' },
        { status: 413 },
      );
    }
    const shareToken = String(form.get('share_token') ?? '').trim();
    const file = form.get('file');
    const phaseId = (form.get('phase_id') ?? '').toString().trim() || null;
    const note = (form.get('note') ?? '').toString().trim() || null;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shareToken)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File missing' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File is too large (10 MB max)' }, { status: 413 });
    }

    const admin = createAdminClient();
    const { data: tracker } = await admin
      .from('onboarding_trackers')
      .select('id, service, status, is_template, notify_emails, clients!inner(name, slug)')
      .eq('share_token', shareToken)
      .maybeSingle();
    if (!tracker || tracker.is_template || tracker.status === 'archived') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // If phase_id provided, confirm it belongs to this tracker.
    if (phaseId) {
      const { data: phase } = await admin
        .from('onboarding_phases')
        .select('id')
        .eq('id', phaseId)
        .eq('tracker_id', tracker.id)
        .maybeSingle();
      if (!phase) return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }

    // Safe filename: strip path separators + limit length. Keep extension
    // because downloaders rely on it for MIME sniffing.
    const rawName = file.name || 'upload';
    const safeName = rawName
      .replace(/[/\\]/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    const uploadId = crypto.randomUUID();
    const storagePath = `onboarding/${tracker.id}/${uploadId}-${safeName}`;

    const { error: putErr } = await admin.storage
      .from('onboarding-uploads')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (putErr) {
      console.error('public upload storage error:', putErr);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: row, error: insErr } = await admin
      .from('onboarding_uploads')
      .insert({
        id: uploadId,
        tracker_id: tracker.id,
        storage_path: storagePath,
        filename: safeName,
        mime_type: file.type || null,
        size_bytes: file.size,
        phase_id: phaseId,
        note,
        uploaded_by: 'client',
      })
      .select('id, filename, size_bytes, mime_type, created_at')
      .single();
    if (insErr || !row) {
      // Best-effort cleanup of the orphaned object.
      await admin.storage.from('onboarding-uploads').remove([storagePath]).catch(() => {});
      console.error('public upload insert error:', insErr);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    // Audit event is awaited so it's durable (a `void` promise gets
    // cancelled when the serverless function returns on Vercel). The
    // batched notification queue coalesces rapid uploads into one email.
    await admin.from('onboarding_events').insert({
      tracker_id: tracker.id,
      kind: 'file_uploaded',
      phase_id: phaseId,
      metadata: { filename: safeName, size: file.size, upload_id: row.id },
      actor: 'client',
    });

    await queueOnboardingNotification(admin, tracker.id, {
      kind: 'file_uploaded',
      detail: safeName,
    });

    // Bump parent flow's POC activity cursor (reminders + no-progress reset).
    const { bumpPocActivityForTracker } = await import('@/lib/onboarding/poc-activity');
    await bumpPocActivityForTracker(admin, tracker.id);

    return NextResponse.json({ ok: true, upload: row });
  } catch (error) {
    console.error('POST /api/onboarding/public/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
