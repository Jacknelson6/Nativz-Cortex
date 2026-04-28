import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { VideoContext } from '@/lib/types/calendar';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string | null = require('ffmpeg-static');
if (ffmpegPath) Ffmpeg.setFfmpegPath(ffmpegPath);

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // OpenAI Whisper hard limit
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

interface TranscribeInput {
  buffer: Buffer;
  ext: string;
  displayName?: string;
}

/**
 * Transcribe a short-form video via OpenAI Whisper. Cheap and fast (~$0.006/min,
 * ~3-5s per video). Replaces the heavy Gemini multimodal analysis we used to
 * run — the caption generator reads the thumbnail directly, so all we need
 * here is the spoken text + detected language.
 *
 * If the video is over Whisper's 25MB limit we extract the audio track to
 * mp3 first (always small enough for short-form). If the video has no audio
 * track at all, returns has_audio=false with empty transcript.
 */
export async function transcribeVideo(input: TranscribeInput): Promise<VideoContext> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  // Always extract audio first. Whisper rejects some MP4 codec/container
  // combinations even within its size limit (e.g. compilation videos exported
  // from certain editors), so a lossless audio-only mp3 is the most reliable
  // input format. It's also strictly smaller, so the 25MB cap is rarely hit.
  let payloadBuffer: Buffer;
  let payloadName = 'audio.mp3';
  let payloadType = 'audio/mpeg';
  try {
    payloadBuffer = await extractAudioMp3(input.buffer, input.ext);
  } catch (err) {
    // ffmpeg can fail on a video that genuinely has no audio track. Treat
    // that as a silent video rather than failing the whole drop.
    const msg = err instanceof Error ? err.message : String(err);
    if (/audio/i.test(msg) && /no.*stream|stream.*not.*found|empty/i.test(msg)) {
      return { transcript: '', language: 'en', has_audio: false };
    }
    throw err;
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(payloadBuffer)], { type: payloadType }),
    payloadName,
  );
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 400 with "audio file is too short" or similar = effectively a silent
    // / muted video. Treat as no-audio rather than failing the whole drop.
    if (res.status === 400 && /too short|silence|no audio/i.test(body)) {
      return { transcript: '', language: 'en', has_audio: false };
    }
    throw new Error(`Whisper ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { text?: string; language?: string };
  const transcript = (json.text ?? '').trim();
  const language = normaliseLang(json.language);
  return {
    transcript,
    language,
    has_audio: transcript.length > 0,
  };
}

async function extractAudioMp3(videoBuffer: Buffer, ext: string): Promise<Buffer> {
  const tmpIn = join(tmpdir(), `cal-vid-${randomUUID()}.${ext}`);
  const tmpOut = join(tmpdir(), `cal-aud-${randomUUID()}.mp3`);
  await writeFile(tmpIn, videoBuffer);
  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(tmpIn)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('64k')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(tmpOut);
    });
    const audio = await readFile(tmpOut);
    const sz = await stat(tmpOut);
    if (sz.size > WHISPER_MAX_BYTES) {
      throw new Error(`Audio still over Whisper limit after extract (${sz.size} bytes)`);
    }
    return audio;
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

// Whisper returns full-language names ("english") in some response formats and
// ISO-639-1 in others; normalise to lowercase BCP-47 short codes.
function normaliseLang(raw: string | undefined): string {
  if (!raw) return 'en';
  const lower = raw.toLowerCase();
  const map: Record<string, string> = {
    english: 'en',
    spanish: 'es',
    french: 'fr',
    portuguese: 'pt',
    german: 'de',
    italian: 'it',
  };
  if (map[lower]) return map[lower];
  // Already a short code like "en" / "es-419" — strip region.
  return lower.split('-')[0];
}
