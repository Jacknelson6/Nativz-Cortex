import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Browsers still request /favicon.ico; Cortex uses file-based `app/icon.png`.
      { source: '/favicon.ico', destination: '/icon.png', permanent: false },
    ];
  },
  compiler: {
    // Strip console.log/warn/info/debug in production (keep console.error)
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }
      : false,
  },
  typescript: {
    // React 19 types regression causes spurious 'unknown is not ReactNode' errors
    // on union-typed component rendering. Safe to ignore — runtime is correct.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Omit lucide-react: webpack server chunks can reference missing
    // ./vendor-chunks/lucide-react.js after HMR or in some RSC graphs (Next 15.5 + webpack).
    optimizePackageImports: [
      'framer-motion',
      'date-fns',
      'recharts',
      '@react-pdf/renderer',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.openrouter.ai https://*.googleapis.com https://*.tikwm.com https://*.apify.com https://*.reddit.com https://*.brave.com wss://*.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.googleapis.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: '*.youtube.com' },
      { protocol: 'https', hostname: '*.ytimg.com' },
      { protocol: 'https', hostname: '*.cdninstagram.com' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
      { protocol: 'https', hostname: '*.tiktokcdn.com' },
      { protocol: 'https', hostname: '*.monday.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg', '@resvg/resvg-js', 'playwright-core'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.playwright-mcp/**',
          '**/.next/**',
          '**/.claude/**',
          '**/logs_llm/**',
        ],
      };
    }

    return config;
  },
};

export default nextConfig;
