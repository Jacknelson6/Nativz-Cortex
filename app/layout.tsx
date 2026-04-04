import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/next';
import { headers } from 'next/headers';
import './globals.css';
import { BrandModeProvider } from '@/components/layout/brand-mode-provider';
import { MobileBlocker } from '@/components/shared/mobile-blocker';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-geist-sans',
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
  const agency = headersList.get('x-agency') as 'anderson' | 'nativz' | null;
  // Force brand mode on BOTH domains — prevents localStorage from loading wrong theme
  const forcedMode = agency === 'anderson' ? 'anderson' as const : 'nativz' as const;

  // Set data-brand-mode directly on <html> so CSS vars apply on first paint
  // before the BrandModeProvider client component hydrates — prevents flash of Nativz theme on AC domain.
  const brandMode = agency === 'anderson' ? 'anderson' : 'nativz';
  const themeColor = agency === 'anderson' ? '#F4F6F8' : '#0f1117';

  return (
    <html lang="en" data-brand-mode={brandMode}>
      <head>
        <meta name="theme-color" content={themeColor} />
      </head>
      <body className={`${jakarta.variable} font-sans antialiased`}>
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
