'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  BENCHMARK_SECTIONS,
  DEFAULT_SECTION_ORDER,
  DEFAULT_VISIBLE_SECTIONS,
  mergeBenchmarkSectionOrder,
} from '@/lib/benchmarks/sections';
import { BenchmarkCard } from '@/lib/benchmarks/charts/benchmark-card';
import { BenchmarkSectionBody } from '@/lib/benchmarks/benchmark-section-body';
import { SlidesPresentView } from '../slides-present-view';
import type { BenchmarkConfig } from '../types';

export default function PresentModePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [presentationType, setPresentationType] = useState<'benchmarks' | 'slides' | null>(null);
  const [deckTitle, setDeckTitle] = useState('');
  const [slides, setSlides] = useState<{ title: string; body: string; image_url?: string | null; notes?: string | null }[]>([]);
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkConfig | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/presentations/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (data.type === 'slides') {
          setPresentationType('slides');
          setDeckTitle(String(data.title ?? 'Presentation'));
          setSlides(Array.isArray(data.slides) ? data.slides : []);
          setLoading(false);
          return;
        }

        if (data.type === 'benchmarks') {
          setPresentationType('benchmarks');
          const config = data.audit_data as BenchmarkConfig | undefined;
          setBenchmarkConfig(
            config && Array.isArray(config.section_order) && Array.isArray(config.visible_sections)
              ? {
                  ...config,
                  section_order: mergeBenchmarkSectionOrder(config.section_order),
                }
              : {
                  visible_sections: [...DEFAULT_VISIBLE_SECTIONS],
                  section_order: [...DEFAULT_SECTION_ORDER],
                  active_vertical_filter: null,
                }
          );
          setLoading(false);
          return;
        }

        setUnsupported(true);
        setLoading(false);
      } catch {
        toast.error('Failed to load presentation');
        router.push(`/admin/presentations/${id}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  const benchmarkSlides = benchmarkConfig
    ? benchmarkConfig.section_order
        .filter((sid) => benchmarkConfig.visible_sections.includes(sid))
        .map((sid) => BENCHMARK_SECTIONS.find((s) => s.id === sid))
        .filter(Boolean)
    : [];

  const totalSlides = presentationType === 'benchmarks' ? benchmarkSlides.length : 0;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const exit = useCallback(() => {
    router.push(`/admin/presentations/${id}`);
  }, [router, id]);

  useEffect(() => {
    if (presentationType !== 'benchmarks') return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'Escape') exit();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [presentationType, goNext, goPrev, exit]);

  useEffect(() => {
    if (!unsupported) return;
    toast.error('Present mode supports slide decks and creative benchmarks only.');
    router.replace(`/admin/presentations/${id}`);
  }, [unsupported, router, id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <p className="text-white/60 text-sm">Redirecting…</p>
      </div>
    );
  }

  if (presentationType === 'slides') {
    return <SlidesPresentView presentationId={id} deckTitle={deckTitle} slides={slides} />;
  }

  if (presentationType === 'benchmarks' && totalSlides === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <p className="text-white/60">No benchmark sections visible</p>
      </div>
    );
  }

  const section = benchmarkSlides[currentIndex]!;

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col">
      <button
        type="button"
        onClick={exit}
        className="cursor-pointer absolute top-4 right-4 z-10 rounded-full p-2 text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
      >
        <X size={20} />
      </button>

      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="max-w-[1100px] w-full animate-fade-in">
          <BenchmarkCard section={section}>
            <BenchmarkSectionBody
              section={section}
              activeFilter={benchmarkConfig?.active_vertical_filter ?? null}
            />
          </BenchmarkCard>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        <div className="flex items-center gap-1.5">
          {benchmarkSlides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={`cursor-pointer h-1.5 rounded-full transition-all ${
                i === currentIndex ? 'w-6 bg-accent-text' : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === totalSlides - 1}
          className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
