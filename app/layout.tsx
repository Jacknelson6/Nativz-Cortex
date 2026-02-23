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
  title: 'Nativz Cortex — Social Intelligence Platform',
  description: 'Social listening, sentiment analysis, and content performance analytics for modern marketing agencies.',
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
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
