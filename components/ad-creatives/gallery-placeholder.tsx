'use client';

import { Loader2, RefreshCw } from 'lucide-react';

interface GalleryPlaceholderProps {
  brandColors: string[];
  templateThumbnailUrl?: string;
  status: 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  onRetry?: () => void;
}

export function GalleryPlaceholder({
  brandColors,
  templateThumbnailUrl,
  status,
  imageUrl,
  onRetry,
}: GalleryPlaceholderProps) {
  const color1 = brandColors[0] ?? '#1e293b';
  const color2 = brandColors[1] ?? brandColors[0] ?? '#334155';

  if (status === 'completed' && imageUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-nativz-border group cursor-pointer">
        <div className="aspect-square">
          <img
            src={imageUrl}
            alt="Generated ad"
            className="h-full w-full object-cover animate-fade-in"
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="relative rounded-xl overflow-hidden border border-red-500/30">
        <div
          className="aspect-square flex flex-col items-center justify-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${color1}40, ${color2}40)`,
          }}
        >
          <p className="text-xs text-red-400 font-medium">Failed</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-200 transition-colors cursor-pointer"
            >
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Generating state
  return (
    <div className="relative rounded-xl overflow-hidden border border-nativz-border">
      <div
        className="aspect-square relative"
        style={{
          background: `linear-gradient(135deg, ${color1}, ${color2})`,
        }}
      >
        {/* Template thumbnail hint */}
        {templateThumbnailUrl && (
          <img
            src={templateThumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
        )}

        {/* Shimmer overlay */}
        <div className="absolute inset-0 shimmer-overlay" />

        {/* Generating indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1.5">
            <Loader2 size={20} className="animate-spin text-white/70" />
            <span className="text-[10px] text-white/60 font-medium">Generating...</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .shimmer-overlay {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.08) 50%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .animate-fade-in {
          animation: fadeIn 0.5s ease-in-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; filter: blur(8px); }
          to { opacity: 1; filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
