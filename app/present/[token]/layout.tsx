// SPY-09 T22a: minimal public layout for the prospect-facing presentation.
// No admin chrome, no header, no nav. Just the dark canvas the panels
// expect.

import type { ReactNode } from 'react';

export default function PresentLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-zinc-950 text-white">{children}</div>;
}
