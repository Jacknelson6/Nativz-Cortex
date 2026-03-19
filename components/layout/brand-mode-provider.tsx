'use client';

import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef, ReactNode } from 'react';

type BrandMode = 'nativz' | 'anderson';

interface BrandModeContextValue {
  mode: BrandMode;
  toggleMode: (e?: React.MouseEvent) => void;
  setMode: (mode: BrandMode) => void;
  /** When true, the brand mode is locked by the server and cannot be toggled */
  isForced: boolean;
}

const BrandModeContext = createContext<BrandModeContextValue>({
  mode: 'nativz',
  toggleMode: () => {},
  setMode: () => {},
  isForced: false,
});

export function useBrandMode() {
  return useContext(BrandModeContext);
}

const STORAGE_KEY = 'nativz-cortex-brand-mode';

interface BrandModeProviderProps {
  children: ReactNode;
  /** When set, locks the brand mode to this value (no localStorage, no toggle) */
  forcedMode?: BrandMode;
}

export function BrandModeProvider({ children, forcedMode }: BrandModeProviderProps) {
  const [mode, setModeState] = useState<BrandMode>(forcedMode ?? 'nativz');
  const initialized = useRef(false);
  const isForced = forcedMode !== undefined;

  // For forced mode, use useLayoutEffect (synchronous before paint) and mark DOM
  useLayoutEffect(() => {
    if (!isForced) return;
    document.documentElement.setAttribute('data-brand-mode', forcedMode);
    document.documentElement.setAttribute('data-brand-forced', 'true');
    setModeState(forcedMode);
    initialized.current = true;
  }, [isForced, forcedMode]);

  // Cleanup: remove forced flag when this provider unmounts
  useEffect(() => {
    if (!isForced) return;
    return () => {
      document.documentElement.removeAttribute('data-brand-forced');
    };
  }, [isForced]);

  // Hydrate from localStorage after mount — skip when forced OR when a child forced provider owns the DOM
  useEffect(() => {
    if (isForced) return;
    // If a nested forced provider already claimed the DOM, don't override
    if (document.documentElement.hasAttribute('data-brand-forced')) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'anderson') {
        setModeState('anderson');
        document.documentElement.setAttribute('data-brand-mode', 'anderson');
      }
    } catch {}
    initialized.current = true;
  }, [isForced, forcedMode]);

  // Sync data-brand-mode attribute on <html> and persist to localStorage
  useEffect(() => {
    // Don't override if a forced child provider owns the DOM
    if (!isForced && document.documentElement.hasAttribute('data-brand-forced')) return;
    document.documentElement.setAttribute('data-brand-mode', mode);
    if (!isForced && initialized.current) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    }
  }, [mode, isForced]);

  const setMode = useCallback((m: BrandMode) => {
    if (isForced) return; // no-op when forced
    setModeState(m);
  }, [isForced]);

  const toggleMode = useCallback((e?: React.MouseEvent) => {
    if (isForced) return; // no-op when forced

    const switchBrand = () => {
      setModeState((prev) => (prev === 'nativz' ? 'anderson' : 'nativz'));
    };

    // Use View Transition API for the circular reveal effect
    if (!document.startViewTransition) {
      switchBrand();
      return;
    }

    // Set CSS custom properties for the click origin (used by the mask animation)
    if (e) {
      const x = e.clientX;
      const y = e.clientY;
      document.documentElement.style.setProperty('--toggle-x', `${x}px`);
      document.documentElement.style.setProperty('--toggle-y', `${y}px`);
    } else {
      // Default to center of screen if no click event
      document.documentElement.style.setProperty('--toggle-x', `${window.innerWidth / 2}px`);
      document.documentElement.style.setProperty('--toggle-y', `${window.innerHeight / 2}px`);
    }

    document.startViewTransition(switchBrand);
  }, [isForced]);

  return (
    <BrandModeContext.Provider value={{ mode, toggleMode, setMode, isForced }}>
      {children}
    </BrandModeContext.Provider>
  );
}
