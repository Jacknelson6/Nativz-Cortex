'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Check, ChevronsUpDown, Building2 } from 'lucide-react';

interface Brand {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
  organization_id: string;
}

interface BrandSwitcherProps {
  activeBrandId: string;
  brands: Brand[];
  collapsed?: boolean;
}

export function BrandSwitcher({ activeBrandId, brands, collapsed = false }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleSwitch = useCallback(async (brandId: string) => {
    if (brandId === activeBrandId) {
      setOpen(false);
      return;
    }

    setSwitching(brandId);
    try {
      const res = await fetch('/api/portal/brands/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: brandId }),
      });

      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error('Brand switch failed:', err);
    } finally {
      setSwitching(null);
    }
  }, [activeBrandId, router]);

  if (!activeBrand) return null;

  return (
    <div ref={containerRef} className="relative">
      {/* Dropdown panel */}
      {open && (
        <div
          className={`absolute z-50 rounded-xl border border-nativz-border bg-surface p-1.5 shadow-elevated animate-[popIn_200ms_cubic-bezier(0.16,1,0.3,1)_forwards] ${
            collapsed
              ? 'left-full ml-2 top-0 min-w-[200px]'
              : 'top-full mt-1.5 left-0 right-0 min-w-[200px]'
          }`}
          style={{ backdropFilter: 'blur(16px)' }}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Your brands
          </div>
          {brands.map((brand) => {
            const isActive = brand.id === activeBrandId;
            const isSwitching = switching === brand.id;
            return (
              <button
                key={brand.id}
                onClick={() => handleSwitch(brand.id)}
                disabled={isSwitching}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-accent-surface/50 text-accent-text'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                } disabled:opacity-50`}
              >
                <BrandIcon brand={brand} size={20} />
                <span className="flex-1 truncate text-left">{brand.name}</span>
                {isActive && <Check size={14} className="shrink-0 text-accent-text" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`group flex w-full items-center rounded-lg border transition-all duration-150 ${
          collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
        } ${
          open
            ? 'border-accent/30 bg-accent-surface/30'
            : 'border-transparent hover:border-nativz-border hover:bg-surface-hover'
        }`}
      >
        <BrandIcon brand={activeBrand} size={collapsed ? 24 : 20} />
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate text-sm font-medium text-text-primary">
                {activeBrand.name}
              </p>
            </div>
            <ChevronsUpDown size={14} className="shrink-0 text-text-muted" />
          </>
        )}
      </button>
    </div>
  );
}

function BrandIcon({ brand, size }: { brand: Brand; size: number }) {
  if (brand.logo_url) {
    return (
      <Image
        src={brand.logo_url}
        alt={brand.name}
        width={size}
        height={size}
        className="rounded-md object-contain shrink-0"
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-md bg-accent-surface shrink-0"
      style={{ width: size, height: size }}
    >
      <Building2 size={size * 0.55} className="text-accent-text" />
    </div>
  );
}
