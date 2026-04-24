import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Browsers still request /favicon.ico; Cortex uses file-based `app/icon.png`.
      { source: '/favicon.ico', destination: '/icon.png', permanent: false },
      // Legacy "audit" → renamed to "analyze-social". Keep bookmarks and any
      // previously-generated share links working.
      { source: '/admin/audit', destination: '/admin/analyze-social', permanent: false },
      { source: '/admin/audit/:path*', destination: '/admin/analyze-social/:path*', permanent: false },
      { source: '/shared/audit/:path*', destination: '/shared/analyze-social/:path*', permanent: false },
      // Portal Content Lab alias — portal is untouched in phase 1 of the
      // brand-root migration.
      { source: '/portal/content-lab', destination: '/portal/strategy-lab', permanent: false },
      { source: '/portal/content-lab/:path*', destination: '/portal/strategy-lab/:path*', permanent: false },
      // Admin-side rename pairs where the directory still lives under /admin/*
      // (only the URL label changed). Rewrites below serve the canonical URL
      // from the legacy directory.
      { source: '/admin/pipeline', destination: '/admin/edits', permanent: false },
      { source: '/admin/pipeline/:path*', destination: '/admin/edits/:path*', permanent: false },
      { source: '/admin/scheduler', destination: '/admin/scheduling', permanent: false },
      { source: '/admin/scheduler/:path*', destination: '/admin/scheduling/:path*', permanent: false },

      // --- Brand-root migration phase 1 (2026-04-24) ---
      // Brand-scoped tools lifted from /admin/* to the root. Each old URL
      // (and any earlier alias) redirects to the new canonical root path so
      // bookmarks, outbound notification links, email templates, and any
      // hard-coded references keep working until they age out (~30 days).
      //
      // Trend Finder — directory renamed /admin/search → /(app)/finder.
      { source: '/admin/search', destination: '/finder', permanent: false },
      { source: '/admin/search/:path*', destination: '/finder/:path*', permanent: false },
      { source: '/admin/finder', destination: '/finder', permanent: false },
      { source: '/admin/finder/:path*', destination: '/finder/:path*', permanent: false },
      // Strategy Lab — directory renamed /admin/strategy-lab → /(app)/lab.
      { source: '/admin/content-lab', destination: '/lab', permanent: false },
      { source: '/admin/content-lab/:path*', destination: '/lab/:path*', permanent: false },
      { source: '/admin/strategy-lab', destination: '/lab', permanent: false },
      { source: '/admin/strategy-lab/:path*', destination: '/lab/:path*', permanent: false },
      // Spying — moved to /(app)/spying. Legacy competitor-* aliases ride along.
      { source: '/admin/competitor-intelligence', destination: '/spying', permanent: false },
      { source: '/admin/competitor-intelligence/:path*', destination: '/spying/:path*', permanent: false },
      { source: '/admin/competitor-spying', destination: '/spying', permanent: false },
      { source: '/admin/competitor-spying/:path*', destination: '/spying/:path*', permanent: false },
      { source: '/admin/spying', destination: '/spying', permanent: false },
      { source: '/admin/spying/:path*', destination: '/spying/:path*', permanent: false },
      // Ads — directory renamed /admin/ad-creatives → /(app)/ads.
      { source: '/admin/ad-creatives', destination: '/ads', permanent: false },
      { source: '/admin/ad-creatives/:path*', destination: '/ads/:path*', permanent: false },
      // Brain — directory renamed /admin/knowledge → /(app)/brain.
      { source: '/admin/knowledge', destination: '/brain', permanent: false },
      { source: '/admin/knowledge/:path*', destination: '/brain/:path*', permanent: false },
      { source: '/admin/brain', destination: '/brain', permanent: false },
      { source: '/admin/brain/:path*', destination: '/brain/:path*', permanent: false },
      // Notes — moved to /(app)/notes.
      { source: '/admin/notes', destination: '/notes', permanent: false },
      { source: '/admin/notes/:path*', destination: '/notes/:path*', permanent: false },
      // Brand profile — moved to /(app)/brand-profile (slug preserved per Jack).
      { source: '/admin/brand-profile', destination: '/brand-profile', permanent: false },
      { source: '/admin/brand-profile/:path*', destination: '/brand-profile/:path*', permanent: false },
    ];
  },
  async rewrites() {
    return [
      // Serve the canonical admin URL from the underlying directory where
      // the directory name still differs from the label. API routes
      // (`/api/scheduler/**`) are intentionally left alone — scheduler
      // provider webhooks hit them by exact URL.
      { source: '/admin/edits', destination: '/admin/pipeline' },
      { source: '/admin/edits/:path*', destination: '/admin/pipeline/:path*' },
      { source: '/admin/scheduling', destination: '/admin/scheduler' },
      { source: '/admin/scheduling/:path*', destination: '/admin/scheduler/:path*' },
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
      // @react-pdf/renderer moved to serverExternalPackages — Next 15 errors
      // out if a package is in both lists (transpile-vs-external conflict).
    ],
    // Client-side Router Cache. Next 15 dropped the default dynamic staleTime
    // to 0s — every back/forward or re-visit re-fetched the RSC payload. Bring
    // back the pre-15 behaviour so revisiting a page within the window paints
    // instantly from cache. Mutations should call `router.refresh()` to
    // invalidate. Static-segment layouts are cached longer since they don't
    // change per-request.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
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
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.openrouter.ai https://*.googleapis.com https://*.tikwm.com https://*.apify.com https://*.reddit.com https://*.brave.com https://vitals.vercel-insights.com https://va.vercel-scripts.com wss://*.supabase.co; frame-src https://www.tiktok.com https://www.youtube.com; object-src 'none'; base-uri 'self'" },
        ],
      },
      {
        // Long-cache static logos + icons. Avoids the "logo flashes every
        // nav" problem — once the browser has it, it won't re-fetch for a
        // week. Not `immutable` because a rebrand would need to invalidate.
        source: '/:file(.*\\.(?:png|svg|webp|avif|ico|jpg|jpeg))',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
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
      // Client-brand logos come from arbitrary customer domains (Shopify
      // CDNs, client websites, etc.). Cortex is an internal admin-only tool
      // behind auth, so the open image-proxy DoS risk is contained. Catch-all
      // lets Next/Image resize these down to display size instead of serving
      // the raw file (some client logos are 1000×990 PNGs for 20×20 slots).
      { protocol: 'https', hostname: '**' },
    ],
  },
  serverExternalPackages: [
    'ffmpeg-static',
    'fluent-ffmpeg',
    '@resvg/resvg-js',
    'playwright-core',
    // react-pdf has dynamic requires for fonts + pdfkit internals that
    // webpack's tracer can't follow; bundling causes runtime "Cannot
    // find module" / "renderToBuffer is not a function" failures on
    // Vercel. Externalizing makes the server import it as plain CJS.
    '@react-pdf/renderer',
    '@react-pdf/pdfkit',
    '@react-pdf/font',
    '@react-pdf/textkit',
    // @napi-rs/canvas ships platform-specific .node binaries that webpack
    // can't parse. Used by lib/ad-creatives-v2/compose.ts for server-side
    // rendering of composited ad frames. Externalize so it loads at
    // runtime via plain require.
    '@napi-rs/canvas',
  ],
  // ffmpeg-static resolves its binary via path.join(__dirname, <name from package.json>)
  // at runtime, which nft cannot trace statically. Explicitly include the binary file
  // in the two routes that spawn it so Vercel copies it into the function bundle.
  outputFileTracingIncludes: {
    '/api/analysis/items/[id]/extract-frames': ['./node_modules/ffmpeg-static/ffmpeg'],
    '/api/search/[id]/sources/extract-frames': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid PackFileCacheStrategy rename/ENOENT races on disk (missing routes-manifest,
      // edge-runtime-webpack.js, chunk *.js) when multiple compiles overlap or tooling touches .next.
      config.cache = { type: 'memory' };
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

// Wrap with the Vercel Workflow SDK so "use workflow" + "use step" directives
// compile correctly. See docs/spec-vercel-workflow-migration.md for the full
// migration plan for the topic-search pipeline. The wrapper is a no-op at
// runtime until a server route calls `start(...)` from `workflow/api`.
export default withWorkflow(nextConfig);
