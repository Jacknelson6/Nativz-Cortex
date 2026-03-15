import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeVideoWithGemini } from '@/lib/ai/gemini';
import { logUsage, calculateGroqAudioCost } from '@/lib/ai/usage';

/**
 * POST /api/reference-videos/[id]/process
 *
 * Analyze a reference video by running Groq Whisper transcription and Gemini visual
 * analysis in parallel. Saves transcript, segments, and visual_analysis to the record.
 * Sets status to 'completed' on success or 'failed' if both steps fail. Logs usage
 * costs to the ai_usage table.
 *
 * @auth Required (any authenticated user)
 * @param id - Reference video UUID
 * @returns {{ video: ReferenceVideo }}
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Get the reference video
  const { data: video } = await admin
    .from('reference_videos')
    .select('*')
    .eq('id', id)
    .single();

  if (!video) {
    return NextResponse.json({ error: 'Reference video not found' }, { status: 404 });
  }

  // Mark as processing
  await admin
    .from('reference_videos')
    .update({ status: 'processing' })
    .eq('id', id);

  try {
    // Run transcription and visual analysis in parallel
    const [transcript, analysis] = await Promise.allSettled([
      transcribeWithGroq(video.url ?? video.file_path ?? ''),
      analyzeVideoWithGemini({
        videoUrl: video.url ?? undefined,
        feature: 'reference_video_analysis',
      }),
    ]);

    const transcriptResult = transcript.status === 'fulfilled' ? transcript.value : null;
    const analysisResult = analysis.status === 'fulfilled' ? analysis.value : null;

    const updateData: Record<string, unknown> = {
      status: 'completed',
      error_message: null,
    };

    if (transcriptResult) {
      updateData.transcript = transcriptResult.text;
      updateData.transcript_segments = transcriptResult.segments;
    }

    if (analysisResult) {
      updateData.visual_analysis = analysisResult;
    }

    // If both failed, mark as failed
    if (!transcriptResult && !analysisResult) {
      const errors = [];
      if (transcript.status === 'rejected') errors.push(`Transcription: ${transcript.reason}`);
      if (analysis.status === 'rejected') errors.push(`Analysis: ${analysis.reason}`);
      updateData.status = 'failed';
      updateData.error_message = errors.join('; ');
    }

    await admin
      .from('reference_videos')
      .update(updateData)
      .eq('id', id);

    // Refetch updated video
    const { data: updated } = await admin
      .from('reference_videos')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json({ video: updated });
  } catch (err) {
    console.error('Reference video processing error:', err);
    await admin
      .from('reference_videos')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', id);

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

// ── Groq Whisper transcription ──────────────────────────────────────────────

async function transcribeWithGroq(
  videoUrl: string,
): Promise<{ text: string; segments: { start: number; end: number; text: string }[] }> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  // Download the video first
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);

  const videoBlob = await videoRes.blob();
  if (videoBlob.size > 25 * 1024 * 1024) {
    throw new Error('Video exceeds 25MB limit for transcription');
  }

  const form = new FormData();
  form.append('file', videoBlob, 'video.mp4');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper error (${res.status}): ${errText.substring(0, 300)}`);
  }

  const data = await res.json();

  // Log usage
  const durationSeconds = data.duration ?? 0;
  await logUsage({
    service: 'groq',
    model: 'whisper-large-v3',
    feature: 'reference_video_transcription',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: calculateGroqAudioCost(durationSeconds),
    metadata: { duration_seconds: durationSeconds },
  });

  return {
    text: data.text ?? '',
    segments: (data.segments ?? []).map((s: { start: number; end: number; text: string }) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  };
}
