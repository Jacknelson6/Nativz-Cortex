import { NextRequest, NextResponse } from 'next/server';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/onboarding/trackers/[id]/uploads/[upload_id]
 * Returns a short-lived signed URL for the admin to download the file.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; upload_id: string }> },
) {
  try {
    const { id, upload_id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { data: upload } = await admin
      .from('onboarding_uploads')
      .select('id, tracker_id, storage_path, filename')
      .eq('id', upload_id)
      .eq('tracker_id', id)
      .maybeSingle();
    if (!upload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: signed, error } = await admin.storage
      .from('onboarding-uploads')
      .createSignedUrl(upload.storage_path, 300, {
        download: upload.filename,
      });
    if (error || !signed) {
      console.error('signed url error:', error);
      return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 });
    }
    return NextResponse.json({ url: signed.signedUrl, filename: upload.filename });
  } catch (error) {
    console.error('GET upload signed-url error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/onboarding/trackers/[id]/uploads/[upload_id]
 * Admin removes the upload row + storage object.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; upload_id: string }> },
) {
  try {
    const { id, upload_id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { data: upload } = await admin
      .from('onboarding_uploads')
      .select('id, storage_path')
      .eq('id', upload_id)
      .eq('tracker_id', id)
      .maybeSingle();
    if (!upload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await admin.storage.from('onboarding-uploads').remove([upload.storage_path]).catch(() => {});
    await admin.from('onboarding_uploads').delete().eq('id', upload_id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
