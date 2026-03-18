import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
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
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
  openGraph: {
    title: 'Nativz Cortex',
    description: 'Social media intelligence platform',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0f1117" />
      </head>
      <body className={`${jakarta.variable} antialiased`}>
        <BrandModeProvider>
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
