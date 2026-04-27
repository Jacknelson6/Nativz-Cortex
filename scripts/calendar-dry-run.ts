/**
 * Content-calendar pipeline dry run.
 *
 * Tests each external integration in isolation:
 *   1. drive       — list a Drive folder via SA impersonation
 *   2. download    — download the smallest video from that folder
 *   3. gemini      — upload to Gemini File API, wait ACTIVE, run a tiny generate
 *   4. openrouter  — round-trip a one-line completion through createCompletion()
 *   5. resend      — send a test email to jack@nativz.io
 *   6. zernio      — GET /accounts to verify ZERNIO_API_KEY works
 *
 * Run all:
 *   npx dotenv -e .env.local -- tsx scripts/calendar-dry-run.ts
 *
 * Run a single test:
 *   npx dotenv -e .env.local -- tsx scripts/calendar-dry-run.ts drive
 *
 * Defaults to the All Shutters and Blinds Drive folder + jack@nativz.io.
 * Override via env: DRY_RUN_FOLDER_URL, DRY_RUN_USER_EMAIL.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder, downloadDriveVideo } from '@/lib/calendar/drive-folder';
import {
  uploadFileToGemini,
  waitForGeminiFileActive,
  generateWithFile,
} from '@/lib/gemini/file-api';
import { createCompletion } from '@/lib/ai/client';
import { sendDropCommentEmail } from '@/lib/email/resend';

const FOLDER_URL =
  process.env.DRY_RUN_FOLDER_URL ??
  'https://drive.google.com/drive/folders/1NmKrZoqFjrJo4WLQFuYih0nWxx8bBvoU?usp=drive_link';
const USER_EMAIL = (process.env.DRY_RUN_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();
const TEST_EMAIL_TO = process.env.DRY_RUN_EMAIL_TO ?? 'jack@nativz.io';

type TestName = 'drive' | 'download' | 'gemini' | 'openrouter' | 'resend' | 'zernio';
const ALL_TESTS: TestName[] = ['drive', 'download', 'gemini', 'openrouter', 'resend', 'zernio'];

interface SharedState {
  userId?: string;
  smallestVideo?: { id: string; name: string; mimeType: string; size: number };
  videoBuffer?: Buffer;
  videoMimeType?: string;
  geminiFileUri?: string;
  geminiFileMimeType?: string;
}

const state: SharedState = {};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

async function resolveJackUserId(): Promise<string> {
  if (state.userId) return state.userId;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (error || !data) {
    throw new Error(`Could not find user with email ${USER_EMAIL}: ${error?.message ?? 'no row'}`);
  }
  state.userId = data.id;
  return data.id;
}

async function testDrive() {
  console.log('  Folder URL:', FOLDER_URL);
  const userId = await resolveJackUserId();
  console.log('  Impersonating user:', USER_EMAIL, `(${userId})`);

  const { folderId, videos } = await listVideosInFolder(userId, FOLDER_URL);
  console.log('  Folder ID:', folderId);
  console.log('  Videos found:', videos.length);
  if (videos.length === 0) throw new Error('Folder has no video files — cannot continue');

  for (const v of videos.slice(0, 5)) {
    console.log(`    • ${v.name} (${v.mimeType}, ${fmtBytes(v.size)})`);
  }
  if (videos.length > 5) console.log(`    … and ${videos.length - 5} more`);

  const sized = videos.filter((v) => v.size > 0).sort((a, b) => a.size - b.size);
  const smallest = sized[0] ?? videos[0];
  state.smallestVideo = smallest;
  console.log('  Smallest video chosen for download test:', smallest.name);
}

async function testDownload() {
  if (!state.smallestVideo) throw new Error('Run drive test first');
  const userId = await resolveJackUserId();
  const { id, name } = state.smallestVideo;

  console.log(`  Downloading: ${name} (${id})`);
  const t0 = Date.now();
  const { buffer, mimeType, size } = await downloadDriveVideo(userId, id);
  console.log(`  Got ${fmtBytes(size)} in ${((Date.now() - t0) / 1000).toFixed(1)}s · mime=${mimeType}`);
  console.log(
    `  First 16 bytes (hex): ${buffer.subarray(0, 16).toString('hex')}`,
  );
  state.videoBuffer = buffer;
  state.videoMimeType = mimeType;
}

async function testGemini() {
  if (!state.videoBuffer || !state.videoMimeType) throw new Error('Run download test first');
  if (!state.smallestVideo) throw new Error('Run drive test first');

  console.log(`  Uploading ${fmtBytes(state.videoBuffer.length)} to Gemini File API…`);
  const ref = await uploadFileToGemini({
    buffer: state.videoBuffer,
    mimeType: state.videoMimeType,
    displayName: state.smallestVideo.name,
  });
  console.log('  Uploaded:', ref.name, '·', ref.uri);

  console.log('  Waiting for ACTIVE state…');
  const t0 = Date.now();
  await waitForGeminiFileActive(ref.name, { timeoutMs: 180_000 });
  console.log(`  ACTIVE after ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log('  Running tiny generate…');
  const result = await generateWithFile<{ summary: string; vibe: string }>({
    fileUri: ref.uri,
    mimeType: ref.mimeType,
    prompt:
      'Watch this short-form video. Return JSON with two fields: ' +
      '"summary" (max 12 words describing what visually happens) and ' +
      '"vibe" (one word: e.g. calm, energetic, instructional).',
    responseSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        vibe: { type: 'string' },
      },
      required: ['summary', 'vibe'],
    },
  });
  console.log('  Gemini said:', JSON.stringify(result));
  state.geminiFileUri = ref.uri;
  state.geminiFileMimeType = ref.mimeType;
}

async function testOpenRouter() {
  console.log('  Sending one-line completion to verify OPENROUTER_API_KEY…');
  const t0 = Date.now();
  const result = await createCompletion({
    messages: [
      {
        role: 'user',
        content:
          'Reply with a single 6-word sentence about a small business growing on TikTok. Just the sentence.',
      },
    ],
    maxTokens: 80,
  });
  console.log(`  Got reply in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('  Text:', result.text.trim());
  console.log(
    '  Tokens (in/out):',
    result.usage.promptTokens,
    '/',
    result.usage.completionTokens,
    `· model=${result.modelUsed} · est=$${result.estimatedCost.toFixed(4)}`,
  );
}

async function testResend() {
  console.log(`  Sending test comment-notification email to ${TEST_EMAIL_TO}…`);
  await sendDropCommentEmail({
    to: TEST_EMAIL_TO,
    authorName: 'Calendar Dry Run',
    clientName: 'All Shutters and Blinds',
    status: 'comment',
    contentPreview:
      'This is a smoke-test email from scripts/calendar-dry-run.ts — confirms RESEND_API_KEY + template render.',
    dropUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/admin/calendar/dry-run-test`,
  });
  console.log(`  Sent. Check the ${TEST_EMAIL_TO} inbox.`);
}

async function testZernio() {
  const base = (process.env.ZERNIO_API_BASE ?? 'https://zernio.com/api/v1').replace(/\/$/, '');
  const key = process.env.ZERNIO_API_KEY ?? process.env.LATE_API_KEY;
  if (!key) throw new Error('ZERNIO_API_KEY not set');
  console.log(`  GET ${base}/accounts`);
  const t0 = Date.now();
  const res = await fetch(`${base}/accounts`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zernio /accounts failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown;
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { accounts?: unknown }).accounts)
      ? (data as { accounts: unknown[] }).accounts
      : [];
  console.log(`  Got ${arr.length} accounts in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const TESTS: Record<TestName, () => Promise<void>> = {
  drive: testDrive,
  download: testDownload,
  gemini: testGemini,
  openrouter: testOpenRouter,
  resend: testResend,
  zernio: testZernio,
};

async function main() {
  const arg = process.argv[2] as TestName | undefined;
  const requested = arg ? [arg] : ALL_TESTS;
  if (arg && !ALL_TESTS.includes(arg)) {
    console.error(`Unknown test "${arg}". Available: ${ALL_TESTS.join(', ')}`);
    process.exit(1);
  }

  // download/gemini have implicit deps. If the user only asks for one, run the
  // upstream prerequisites silently rather than failing.
  const expanded = new Set<TestName>();
  for (const t of requested) {
    if (t === 'gemini') {
      expanded.add('drive');
      expanded.add('download');
    } else if (t === 'download') {
      expanded.add('drive');
    }
    expanded.add(t);
  }
  const order = ALL_TESTS.filter((t) => expanded.has(t));

  const results: { name: TestName; ok: boolean; ms: number; error?: string }[] = [];
  for (const name of order) {
    console.log(`\n── ${name.toUpperCase()} ──`);
    const t0 = Date.now();
    try {
      await TESTS[name]();
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log(`  ✓ ${name} OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, ms: Date.now() - t0, error: msg });
      console.error(`  ✗ ${name} FAILED: ${msg}`);
    }
  }

  console.log('\n── Summary ──');
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    console.log(`  ${tag} ${r.name.padEnd(11)} ${(r.ms / 1000).toFixed(1)}s${r.error ? `  — ${r.error}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Dry run crashed:', err);
  process.exit(1);
});
