import type { ExtractedFrame } from './types';

/** Max dimension on either axis — actual size adapts to the video's aspect ratio. */
const MAX_DIM = 640;

/** Compute canvas size preserving aspect ratio, capped at MAX_DIM. */
function fitDimensions(videoWidth: number, videoHeight: number): { w: number; h: number } {
  if (videoWidth === 0 || videoHeight === 0) return { w: 640, h: 360 };
  const ratio = videoWidth / videoHeight;
  if (ratio >= 1) {
    // Landscape or square
    return { w: MAX_DIM, h: Math.round(MAX_DIM / ratio) };
  }
  // Portrait
  return { w: Math.round(MAX_DIM * ratio), h: MAX_DIM };
}

/** Create a video element and wait for metadata. */
async function loadVideo(videoUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => {
      const me = video.error;
      const detail =
        me != null
          ? `code=${me.code} message=${me.message ?? ''}`
          : 'unknown media error';
      const srcHint =
        videoUrl.length > 120 ? `${videoUrl.slice(0, 120)}…` : videoUrl;
      reject(
        new Error(
          `Failed to load video (${detail}). If this is a cross-origin CDN URL, CORS may block canvas use — try a direct file or proxied URL. Src: ${srcHint}`
        )
      );
    };
    setTimeout(() => reject(new Error('Video metadata load timeout')), 30_000);
  });

  return video;
}

const SEEK_TIMEOUT_MS = 15_000;

/**
 * Seek video to a time (seconds) and wait for `seeked`, or reject with Error on error/timeout.
 * Prevents hanging promises when decode fails (some runtimes surface Event-like rejections upstream).
 */
function seekVideo(video: HTMLVideoElement, tSeconds: number): Promise<void> {
  if (Number.isFinite(tSeconds) && Math.abs(video.currentTime - tSeconds) < 0.001) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      const me = video.error;
      const detail =
        me != null
          ? `code=${me.code} message=${me.message ?? ''}`
          : 'unknown media error during seek';
      reject(new Error(`Video seek failed (${detail})`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Video seek timeout'));
    }, SEEK_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    }

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.currentTime = tSeconds;
  });
}

/**
 * Extract frames from a video URL at the given FPS using a hidden
 * `<video>` + `<canvas>`. Returns ImageData objects for each frame.
 *
 * Must run on the main thread (needs DOM).
 */
export async function extractFrames(
  videoUrl: string,
  fps: number = 4,
  maxFrames: number = 200,
  onProgress?: (progress: number) => void
): Promise<ExtractedFrame[]> {
  const video = await loadVideo(videoUrl);

  const { w, h } = fitDimensions(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas 2d context');

  const frames: ExtractedFrame[] = [];
  const intervalMs = 1000 / fps;
  const durationMs = video.duration * 1000;
  const totalExpected = Math.min(
    Math.floor(durationMs / intervalMs),
    maxFrames
  );

  for (
    let t = 0;
    t < durationMs && frames.length < maxFrames;
    t += intervalMs
  ) {
    await seekVideo(video, t / 1000);

    ctx.drawImage(video, 0, 0, w, h);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Canvas pixel read failed (${msg}). Usually means the video is cross-origin without CORS — cannot run MediaPipe on this URL.`
      );
    }
    frames.push({
      timestamp: t,
      imageData,
    });

    onProgress?.(frames.length / totalExpected);
  }

  // Cleanup
  video.src = '';
  video.load();

  return frames;
}

/**
 * Extract frames only from a specific time range.
 */
export async function extractFramesRange(
  videoUrl: string,
  startMs: number,
  endMs: number,
  fps: number = 10,
  maxFrames: number = 100,
  onProgress?: (progress: number) => void
): Promise<ExtractedFrame[]> {
  const video = await loadVideo(videoUrl);

  const { w, h } = fitDimensions(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas 2d context');

  const frames: ExtractedFrame[] = [];
  const intervalMs = 1000 / fps;
  const totalExpected = Math.min(
    Math.floor((endMs - startMs) / intervalMs),
    maxFrames
  );

  for (
    let t = startMs;
    t < endMs && frames.length < maxFrames;
    t += intervalMs
  ) {
    await seekVideo(video, t / 1000);

    ctx.drawImage(video, 0, 0, w, h);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Canvas pixel read failed (${msg}). Usually means the video is cross-origin without CORS — cannot run MediaPipe on this URL.`
      );
    }
    frames.push({
      timestamp: t,
      imageData,
    });

    onProgress?.(frames.length / totalExpected);
  }

  video.src = '';
  video.load();

  return frames;
}

/**
 * Draw an ImageData to a canvas and return a JPEG data URL.
 * Canvas is resized to match the frame dimensions automatically.
 */
export function frameToDataUrl(
  imageData: ImageData,
  canvas: HTMLCanvasElement
): string {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Create a reusable canvas for thumbnail generation.
 */
export function createThumbnailCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}
