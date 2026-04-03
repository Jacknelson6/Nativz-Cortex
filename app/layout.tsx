import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { headers } from 'next/headers';
import './globals.css';
import { BrandModeProvider } from '@/components/layout/brand-mode-provider';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nativz Cortex',
  description: 'Social media intelligence platform',
  // Favicon + Apple touch: `app/icon.png` and `app/apple-icon.png` (Nativz marketing favicon).
  openGraph: {
    title: 'Nativz Cortex',
    description: 'Social media intelligence platform',
    type: 'website',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const agency = headersList.get('x-agency') as 'anderson' | 'nativz' | null;
  const forcedMode = agency === 'anderson' ? 'anderson' as const : undefined;

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0f1117" />
      </head>
      <body className={`${jakarta.variable} font-sans antialiased`}>
        <BrandModeProvider forcedMode={forcedMode}>
          {children}
        </BrandModeProvider>
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
