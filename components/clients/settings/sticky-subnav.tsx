'use client';

import { useEffect, useState } from 'react';

/**
 * Sticky in-page anchor nav used on aggregated settings pages
 * (Info, Partnership). Lets admins scroll-jump between sub-sections
 * without hiding content behind tabs. Uses IntersectionObserver to
 * highlight the currently-visible section.
 *
 * Sections are addressable by their DOM `id`; on click, smooth-scrolls
 * to the target and pushes the id onto the URL hash so shareable links
 * deep-link into a subsection.
 */
export function StickySubnav({
  sections,
  offsetTop = 80,
}: {
  sections: { id: string; label: string }[];
  /** Vertical offset when scrolling to a section (accounts for sticky nav itself). */
  offsetTop?: number;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    sections.length > 0 ? sections[0].id : null,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top that's intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      {
        rootMargin: `-${offsetTop + 20}px 0px -60% 0px`,
        threshold: [0, 0.25, 0.5],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, offsetTop]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const container = el.closest('.overflow-y-auto') as HTMLElement | null;
    if (container) {
      const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - offsetTop;
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    history.replaceState(null, '', `#${id}`);
    setActiveId(id);
  }

  return (
    <nav
      className="sticky top-0 z-10 -mx-2 bg-background/80 backdrop-blur-md border-b border-nativz-border/60"
      aria-label="Page sections"
    >
      <ul className="flex gap-1 px-2 py-2 overflow-x-auto">
        {sections.map((s) => {
          const active = activeId === s.id;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                onClick={(e) => handleClick(e, s.id)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  active
                    ? 'bg-accent-surface text-accent-text'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
