'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, useTransition, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface SubNavItem<TSlug extends string = string> {
  slug: TSlug;
  label: string;
  icon?: ReactNode;
}

interface SubNavRowProps {
  children: ReactNode;
  ariaLabel?: string;
}

function SubNavRow({ children, ariaLabel = 'Page sections' }: SubNavRowProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center gap-1 border-b border-nativz-border"
    >
      {children}
    </nav>
  );
}

interface SubNavTabProps {
  active: boolean;
  pending?: boolean;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
  children: ReactNode;
}

function SubNavTab({ active, pending, onClick, href, icon, children }: SubNavTabProps) {
  const cls =
    'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer border-b-2 -mb-px ' +
    (active
      ? 'border-accent-text text-text-primary'
      : 'border-transparent text-text-muted hover:text-text-secondary');

  const inner = (
    <>
      {pending ? <Loader2 size={13} className="animate-spin" /> : icon}
      {children}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        className={cls}
        aria-current={active ? 'page' : undefined}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      aria-current={active ? 'page' : undefined}
    >
      {inner}
    </button>
  );
}

interface SubNavProps<TSlug extends string> {
  items: readonly SubNavItem<TSlug>[];
  active: TSlug;
  onChange: (slug: TSlug) => void;
  ariaLabel?: string;
}

export function SubNav<TSlug extends string>({
  items,
  active,
  onChange,
  ariaLabel,
}: SubNavProps<TSlug>) {
  return (
    <SubNavRow ariaLabel={ariaLabel}>
      {items.map((it) => (
        <SubNavTab
          key={it.slug}
          active={it.slug === active}
          onClick={() => onChange(it.slug)}
          icon={it.icon}
        >
          {it.label}
        </SubNavTab>
      ))}
    </SubNavRow>
  );
}

interface SubNavLinksProps<TSlug extends string> {
  items: readonly SubNavItem<TSlug>[];
  active: TSlug;
  /** Search param to write — defaults to `tab`. */
  paramKey?: string;
  /** Optional localStorage key for "last tab" memory. */
  memoryKey?: string;
  /**
   * When true (default), paint the clicked tab as active immediately and
   * surface a hairline progress bar + spinner while the next RSC payload
   * loads. Set false for navigations that resolve instantly.
   */
  optimistic?: boolean;
  ariaLabel?: string;
}

export function SubNavLinks<TSlug extends string>(props: SubNavLinksProps<TSlug>) {
  return (
    <Suspense fallback={<SubNavLinksSkeleton count={props.items.length} ariaLabel={props.ariaLabel} />}>
      <SubNavLinksInner {...props} />
    </Suspense>
  );
}

function SubNavLinksSkeleton({ count, ariaLabel }: { count: number; ariaLabel?: string }) {
  return (
    <SubNavRow ariaLabel={ariaLabel}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="px-3 py-2">
          <span className="inline-block h-3 w-14 rounded bg-surface-hover/40" />
        </span>
      ))}
    </SubNavRow>
  );
}

function SubNavLinksInner<TSlug extends string>({
  items,
  active,
  paramKey = 'tab',
  memoryKey,
  optimistic = true,
  ariaLabel,
}: SubNavLinksProps<TSlug>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingSlug, setPendingSlug] = useState<TSlug | null>(null);

  useEffect(() => {
    if (pendingSlug === active) setPendingSlug(null);
  }, [active, pendingSlug]);

  useEffect(() => {
    if (!memoryKey) return;
    try {
      window.localStorage.setItem(memoryKey, active);
    } catch {
      /* private mode / storage disabled */
    }
  }, [active, memoryKey]);

  const displayActive = pendingSlug ?? active;

  function go(slug: TSlug) {
    if (slug === displayActive) return;
    const qs = new URLSearchParams(params);
    qs.set(paramKey, slug);
    if (optimistic) setPendingSlug(slug);
    startTransition(() => {
      router.push(`${pathname}?${qs.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="relative">
      <SubNavRow ariaLabel={ariaLabel}>
        {items.map((it) => {
          const isActive = it.slug === displayActive;
          const showSpinner = optimistic && isPending && it.slug === pendingSlug;
          return (
            <SubNavTab
              key={it.slug}
              active={isActive}
              pending={showSpinner}
              onClick={() => go(it.slug)}
              icon={it.icon}
            >
              {it.label}
            </SubNavTab>
          );
        })}
      </SubNavRow>
      {optimistic && (
        <span
          aria-hidden
          className={
            'pointer-events-none absolute -bottom-px left-0 right-0 h-px origin-left transition-transform duration-500 bg-gradient-to-r from-transparent via-accent/70 to-transparent ' +
            (isPending ? 'scale-x-100' : 'scale-x-0')
          }
        />
      )}
    </div>
  );
}
