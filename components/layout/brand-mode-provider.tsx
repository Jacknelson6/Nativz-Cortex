'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

type BrandMode = 'nativz' | 'anderson';

interface BrandModeContextValue {
  mode: BrandMode;
  toggleMode: (e?: React.MouseEvent) => void;
  setMode: (mode: BrandMode) => void;
}

const BrandModeContext = createContext<BrandModeContextValue>({
  mode: 'nativz',
  toggleMode: () => {},
  setMode: () => {},
});

export function useBrandMode() {
  return useContext(BrandModeContext);
}

const STORAGE_KEY = 'nativz-cortex-brand-mode';

export function BrandModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<BrandMode>('nativz');
  const initialized = useRef(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'anderson') setModeState('anderson');
    } catch {}
    initialized.current = true;
  }, []);

  // Sync data-brand-mode attribute on <html> and persist to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-brand-mode', mode);
    if (initialized.current) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    }
  }, [mode]);

  const setMode = useCallback((m: BrandMode) => setModeState(m), []);

  const toggleMode = useCallback((e?: React.MouseEvent) => {
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
  }, []);

  return (
    <BrandModeContext.Provider value={{ mode, toggleMode, setMode }}>
      {children}
    </BrandModeContext.Provider>
  );
}
