'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Slide {
  title: string;
  body: string;
  image_url?: string | null;
}

export default function PresentModePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/presentations/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSlides(data.slides ?? []);
      } catch {
        toast.error('Failed to load presentation');
        router.push(`/admin/presentations/${id}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const exit = useCallback(() => {
    router.push(`/admin/presentations/${id}`);
  }, [router, id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'Escape') exit();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, exit]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <p className="text-white/60">No slides in this presentation</p>
      </div>
    );
  }

  const slide = slides[currentIndex];

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col">
      {/* Close button */}
      <button
        onClick={exit}
        className="cursor-pointer absolute top-4 right-4 z-10 rounded-full p-2 text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
      >
        <X size={20} />
      </button>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="max-w-4xl w-full space-y-8 text-center">
          {slide.image_url && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image_url}
                alt=""
                className="max-h-[40vh] rounded-xl object-contain"
              />
            </div>
          )}
          {slide.title && (
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              {slide.title}
            </h1>
          )}
          {slide.body && (
            <div className="text-lg md:text-xl text-white/70 leading-relaxed whitespace-pre-wrap max-w-3xl mx-auto">
              {slide.body}
            </div>
          )}
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        {/* Progress */}
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`cursor-pointer h-1.5 rounded-full transition-all ${
                i === currentIndex ? 'w-6 bg-accent-text' : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={currentIndex === slides.length - 1}
          className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
