import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nativz Cortex',
  description: 'Social media intelligence platform',
  icons: { icon: '/favicon.svg' },
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
        {children}
        <Toaster
          position="bottom-right"
          richColors
          theme="dark"
          toastOptions={{
            className: '!bg-zinc-900/90 !backdrop-blur-xl !border-white/10 !text-zinc-100',
          }}
        />
      </body>
    </html>
  );
}
