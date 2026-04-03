/**
 * Browser-based video frame extraction using <video> + <canvas>.
 * No FFmpeg required — works on any browser.
 *
 * Flow:
 * 1. Load video into a hidden <video> element (via tikwm direct URL or proxy)
 * 2. Seek to each timestamp
 * 3. Draw frame to <canvas> and export as blob
 * 4. Upload blob to Supabase storage
 * 5. Return frame URLs + timestamps
 */

const FRAME_INTERVAL_SEC = 3;
const FRAME_WIDTH = 360;
const FRAME_HEIGHT = 640;

export interface ExtractedFrame {
  url: string;
  timestamp: number;
  label: string;
}

/**
 * Extract frames from a video URL in the browser.
 * Returns an array of frames with Supabase storage URLs.
 */
export async function extractFramesInBrowser(
  videoUrl: string,
  opts: {
    storagePrefix: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    intervalSec?: number;
  },
): Promise<{ frames: ExtractedFrame[]; duration: number }> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(opts.supabaseUrl, opts.supabaseAnonKey);
  const interval = opts.intervalSec ?? FRAME_INTERVAL_SEC;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D context unavailable'));
      return;
    }

    let resolved = false;

    video.onloadedmetadata = async () => {
      if (resolved) return;
      const duration = video.duration;
      if (!duration || !Number.isFinite(duration)) {
        reject(new Error('Could not determine video duration'));
        return;
      }

      const timestamps: number[] = [];
      for (let t = 0; t < duration; t += interval) {
        timestamps.push(t);
      }

      const frames: ExtractedFrame[] = [];

      for (const ts of timestamps) {
        try {
          const blob = await seekAndCapture(video, canvas, ctx, ts);
          const m = Math.floor(ts / 60);
          const s = Math.floor(ts % 60);
          const label = `${m}:${String(s).padStart(2, '0')}`;

          // Upload to Supabase storage
          const path = `${opts.storagePrefix}/${crypto.randomUUID()}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from('moodboard-frames')
            .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

          if (uploadErr) {
            console.warn('[browser-frames] Upload error:', uploadErr);
            continue;
          }

          const { data: publicUrl } = supabase.storage
            .from('moodboard-frames')
            .getPublicUrl(path);

          frames.push({
            url: publicUrl.publicUrl,
            timestamp: ts,
            label,
          });
        } catch (e) {
          console.warn('[browser-frames] Frame capture error at', ts, e);
        }
      }

      resolved = true;
      video.src = '';
      resolve({ frames, duration: Math.ceil(duration) });
    };

    video.onerror = () => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Failed to load video for frame extraction'));
      }
    };

    // Timeout after 60s
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        video.src = '';
        reject(new Error('Frame extraction timed out'));
      }
    }, 60_000);

    video.src = videoUrl;
    video.load();
  });
}

function seekAndCapture(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  timestamp: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    video.currentTime = timestamp;

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);

      // Draw video frame to canvas (center-crop to 9:16)
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetRatio = FRAME_WIDTH / FRAME_HEIGHT;
      const sourceRatio = vw / vh;

      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (sourceRatio > targetRatio) {
        // Source is wider — crop sides
        sw = vh * targetRatio;
        sx = (vw - sw) / 2;
      } else {
        // Source is taller — crop top/bottom
        sh = vw / targetRatio;
        sy = (vh - sh) / 2;
      }

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob returned null'));
        },
        'image/jpeg',
        0.85,
      );
    };

    video.addEventListener('seeked', onSeeked, { once: true });

    // Timeout per frame
    setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('Seek timeout'));
    }, 10_000);
  });
}
