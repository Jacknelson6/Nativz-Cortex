import { NextRequest, NextResponse } from 'next/server';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/onboarding/trackers/[id]/uploads
 * Admin list of every upload tied to this tracker, newest first.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { data, error } = await admin
      .from('onboarding_uploads')
      .select('id, tracker_id, filename, mime_type, size_bytes, note, phase_id, uploaded_by, created_at')
      .eq('tracker_id', id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('GET tracker uploads error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ uploads: data ?? [] });
  } catch (error) {
    console.error('GET /api/onboarding/trackers/[id]/uploads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
