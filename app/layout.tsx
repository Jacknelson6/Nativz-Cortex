import type { Metadata } from 'next';
import { Jost, Poppins, Rubik, Sora, Roboto } from 'next/font/google';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/next';
import { headers } from 'next/headers';
import './globals.css';
import { BrandModeProvider } from '@/components/layout/brand-mode-provider';
import { MobileBlocker } from '@/components/shared/mobile-blocker';
import { getSupabaseUrl } from '@/lib/supabase/public-env';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

// Nativz brand typography — Jost (display), Poppins (body), Rubik (UI sans).
// Anderson Collaborative typography — Sora (display), Roboto (body), Rubik shared.
//
// Both sets load always (agency is decided server-side; a static layout can't
// conditionally import fonts). We DO trim weights aggressively — a repo-wide
// audit on 2026-04-23 found:
//   • 0 uses of `font-extrabold` (800) or `font-black` (900)
//   • 3 uses of `font-light` (300) total across the whole codebase
//   • 1222 uses of `font-medium` (500) — keep
// Weights 400/500/600/700 cover 99%+ of the UI. Dropping 300/800 from every
// family removes ~5 woff2 requests on first paint. See also:
// Rubik used to load twice (once as `--font-nz-sans`, once as the
// `--font-geist-sans` legacy alias) — the alias was never actually
// referenced, so it's deleted.
const jost = Jost({
  variable: '--font-nz-display',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const poppins = Poppins({
  variable: '--font-nz-body',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const rubik = Rubik({
  variable: '--font-nz-sans',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const sora = Sora({
  variable: '--font-ac-display',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  // Sora ships italic as a synthesized axis — Google Fonts does not serve a
  // distinct italic subset for it. We still load the upright weights above;
  // AC eyebrow now skips italic entirely (see globals.css .nz-eyebrow rule)
  // so we don't rely on faux-italic rendering.
});

const roboto = Roboto({
  variable: '--font-ac-body',
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

// Dynamic metadata — title and favicon switch based on domain
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const agency = headersList.get('x-agency') as 'anderson' | 'nativz' | null;
  const isAC = agency === 'anderson';

  const title = 'Cortex';
  const description = isAC
    ? 'Anderson Collaborative content intelligence platform'
    : 'Nativz content intelligence platform';

  const favicon = isAC ? '/favicon-ac.png' : '/favicon.png';

  return {
    title,
    description,
    icons: {
      icon: favicon,
      apple: '/apple-icon.png',
    },
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  // Prefer the middleware-set header, but fall back to hostname detection
  // for routes the middleware matcher doesn't cover (e.g. `/c/:token`
  // public share links). Without this fallback, AC clients hitting
  // cortex.andersoncollaborative.com on a non-matched route render Nativz.
  const headerAgency = headersList.get('x-agency') as 'anderson' | 'nativz' | null;
  const hostname =
    headersList.get('x-forwarded-host')
    ?? headersList.get('host')
    ?? '';
  const agency = headerAgency ?? detectAgencyFromHostname(hostname);
  // Force brand mode on BOTH domains — prevents localStorage from loading wrong theme
  const forcedMode = agency === 'anderson' ? 'anderson' as const : 'nativz' as const;

  // Set data-brand-mode directly on <html> so CSS vars apply on first paint
  // before the BrandModeProvider client component hydrates — prevents flash of Nativz theme on AC domain.
  const brandMode = agency === 'anderson' ? 'anderson' : 'nativz';
  const themeColor = agency === 'anderson' ? '#F4F6F8' : '#0f1117';

  // Every authenticated nav + every Next/Image-optimised client logo hits
  // Supabase. Preconnect so TLS + DNS run in parallel with HTML parse
  // instead of serially on the first data fetch — saves ~50-150ms on cold
  // sessions. Crossorigin because Supabase is a different origin.
  const supabaseOrigin = (() => {
    try {
      return new URL(getSupabaseUrl()).origin;
    } catch {
      return null;
    }
  })();

  // Preload the active agency lockup. Without this, the Anderson SVG is
  // served via a plain <img> at the top-left of the admin shell — the
  // browser only discovers it when the parser reaches that node, so it
  // "pops in" a beat after paint even on refresh. Nativz already preloads
  // via Next/Image's priority flag; this parallels that for Anderson.
  const agencyLogoHref =
    forcedMode === 'anderson' ? '/anderson-logo-dark.svg' : '/nativz-logo.png';
  const agencyLogoType = forcedMode === 'anderson' ? 'image/svg+xml' : 'image/png';

  return (
    <html lang="en" data-brand-mode={brandMode}>
      <head>
        <meta name="theme-color" content={themeColor} />
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
        <link
          rel="preload"
          as="image"
          href={agencyLogoHref}
          type={agencyLogoType}
          fetchPriority="high"
        />
      </head>
      <body
        className={`${jost.variable} ${poppins.variable} ${rubik.variable} ${sora.variable} ${roboto.variable} font-sans antialiased`}
      >
        <BrandModeProvider forcedMode={forcedMode}>
          <MobileBlocker />
          {children}
        </BrandModeProvider>
        <Analytics />
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            className: '!bg-surface/90 !backdrop-blur-xl !border-nativz-border !text-text-primary',
          }}
        />
      </body>
    </html>
  );
}
