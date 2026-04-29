/**
 * Probe each Avondale May video's codec via ffprobe to find HEVC offenders.
 *
 *   npx tsx scripts/probe-avondale-codecs.ts
 *
 * The retry script ffmpeg-compressed the 8 videos > 45MB to H.264, but the
 * 2 that went through the original ingest path may still be HEVC (phone
 * default) which Chrome can't reliably play.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DROP_ID = 'c6c4ccb7-49d1-4c6b-8786-9e8c7ad0778d';

interface ProbeResult {
  codec_name: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
}

function ffprobe(url: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt',
      '-of', 'json',
      url,
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe ${code}: ${err.slice(-300)}`));
      try {
        const j = JSON.parse(out);
        resolve(j.streams?.[0] ?? { codec_name: 'unknown' });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { data: videos } = await admin
    .from('content_drop_videos')
    .select('order_index, drive_file_name, video_url, size_bytes')
    .eq('drop_id', DROP_ID)
    .order('order_index');

  if (!videos) {
    console.error('no videos');
    process.exit(1);
  }

  for (const v of videos) {
    const sizeMB = v.size_bytes ? (Number(v.size_bytes) / 1024 / 1024).toFixed(1) : '?';
    process.stdout.write(`#${String(v.order_index).padStart(2, '0')} ${v.drive_file_name} (${sizeMB}MB) … `);
    if (!v.video_url) {
      console.log('no url');
      continue;
    }
    try {
      const probe = await ffprobe(v.video_url);
      const tag = probe.codec_name === 'h264' ? 'OK ' : '⚠️ ';
      console.log(
        `${tag} ${probe.codec_name}${probe.profile ? ` (${probe.profile})` : ''} ${probe.width}x${probe.height} ${probe.pix_fmt ?? ''}`,
      );
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : 'fail'}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
