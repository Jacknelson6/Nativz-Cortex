import type { SocialPlatform } from '@/lib/types/scheduler';

export interface VideoValidationWarning {
  type: 'aspect_ratio' | 'duration' | 'file_size';
  message: string;
  severity: 'warning' | 'error';
}

// Platform-specific limits
const PLATFORM_LIMITS: Record<SocialPlatform, { maxDuration: number; maxSizeMB: number; preferredAspect: string }> = {
  instagram: { maxDuration: 90, maxSizeMB: 4096, preferredAspect: '9:16' },
  tiktok: { maxDuration: 600, maxSizeMB: 287, preferredAspect: '9:16' },
  youtube: { maxDuration: 60, maxSizeMB: 256000, preferredAspect: '9:16' },
  facebook: { maxDuration: 14400, maxSizeMB: 4096, preferredAspect: '9:16' },
  linkedin: { maxDuration: 600, maxSizeMB: 5120, preferredAspect: '9:16' },
};

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_UPLOAD_SIZE_MB = 500;

export function validateVideoFile(file: File): VideoValidationWarning[] {
  const warnings: VideoValidationWarning[] = [];

  if (!ALLOWED_TYPES.includes(file.type)) {
    warnings.push({
      type: 'file_size',
      message: `Unsupported file type: ${file.type}. Use MP4, MOV, or WebM.`,
      severity: 'error',
    });
  }

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_UPLOAD_SIZE_MB) {
    warnings.push({
      type: 'file_size',
      message: `File is ${sizeMB.toFixed(0)} MB — maximum upload size is ${MAX_UPLOAD_SIZE_MB} MB.`,
      severity: 'error',
    });
  }

  return warnings;
}

export function validateVideoMetadata(
  width: number | null,
  height: number | null,
  durationSeconds: number | null,
  targetPlatforms: SocialPlatform[]
): VideoValidationWarning[] {
  const warnings: VideoValidationWarning[] = [];

  // Aspect ratio check
  if (width && height) {
    const ratio = width / height;
    const isVertical = ratio < 1; // 9:16 = 0.5625
    const isSquare = Math.abs(ratio - 1) < 0.1;

    if (!isVertical && !isSquare) {
      const affectedPlatforms = targetPlatforms.filter(p => PLATFORM_LIMITS[p]?.preferredAspect === '9:16');
      if (affectedPlatforms.length > 0) {
        warnings.push({
          type: 'aspect_ratio',
          message: `Video is ${width}x${height} (landscape). ${affectedPlatforms.join(', ')} expect 9:16 (vertical).`,
          severity: 'warning',
        });
      }
    }
  }

  // Duration check per platform
  if (durationSeconds) {
    for (const platform of targetPlatforms) {
      const limit = PLATFORM_LIMITS[platform];
      if (limit && durationSeconds > limit.maxDuration) {
        const minutes = Math.floor(limit.maxDuration / 60);
        const seconds = limit.maxDuration % 60;
        const durationStr = minutes > 0
          ? `${minutes}m${seconds > 0 ? ` ${seconds}s` : ''}`
          : `${seconds}s`;
        warnings.push({
          type: 'duration',
          message: `Video is ${Math.floor(durationSeconds)}s — ${platform} max is ${durationStr}.`,
          severity: 'warning',
        });
      }
    }
  }

  return warnings;
}
