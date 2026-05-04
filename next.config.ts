import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Browsers still ping /favicon.ico for legacy RSS readers / old
      // chromes. Per-host icons live in `metadata.icons` (see app/layout.tsx)
      // — those win on every modern browser. This redirect is just the
      // fallback; point it at the Nativz favicon since AC visitors will get
      // the AC link tag from metadata.icons before this URL is requested.
      { source: '/favicon.ico', destination: '/favicon.png', permanent: false },
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
      // /admin/scheduler is the Zernio social-post scheduler (content
      // calendar). /admin/availability is the cal.com-style team
      // availability picker (added 2026-04-26, renamed from /admin/scheduling
      // 2026-05-03). Aliases below keep old bookmarks working.
      { source: '/admin/scheduling', destination: '/admin/availability', permanent: false },
      { source: '/admin/scheduling/:path*', destination: '/admin/availability/:path*', permanent: false },

      // Phase 2 — unified auth surface at the root. /login,
      // /forgot-password, /reset-password are the canonical entry points;
      // the legacy /admin/* and /portal/* aliases redirect here so any
      // in-flight emails or saved bookmarks resolve.
      { source: '/admin/login', destination: '/login', permanent: false },
      { source: '/portal/login', destination: '/login', permanent: false },
      { source: '/admin/forgot-password', destination: '/forgot-password', permanent: false },
      { source: '/portal/forgot-password', destination: '/forgot-password', permanent: false },
      { source: '/admin/reset-password', destination: '/reset-password', permanent: false },
      { source: '/portal/reset-password', destination: '/reset-password', permanent: false },
      // Invite acceptance moved /portal/join/[token] → /join/[token]. The
      // colon-asterisk capture passes the token segment through unchanged.
      { source: '/portal/join/:token*', destination: '/join/:token*', permanent: false },
      // Viewer billing surface retired with /portal/* — admins still see
      // billing inside /admin/account. Viewers don't have a billing UI yet,
      // so the redirect lands them in the shell where the avatar popover
      // covers account-level needs.
      { source: '/portal/billing', destination: '/admin/account', permanent: false },
      { source: '/portal/billing/:path*', destination: '/admin/account', permanent: false },

      // Phase 2 — every legacy /portal/* brand tool collapses into the
      // unified `(app)` shell at the root. Listed in match order: deeper
      // aliases first, broader prefixes last. Outbound emails, share links,
      // and saved bookmarks keep resolving until they age out.
      { source: '/portal/search', destination: '/finder', permanent: false },
      { source: '/portal/search/:path*', destination: '/finder/:path*', permanent: false },
      { source: '/portal/strategy-lab', destination: '/lab', permanent: false },
      { source: '/portal/strategy-lab/:path*', destination: '/lab/:path*', permanent: false },
      { source: '/portal/knowledge', destination: '/brain', permanent: false },
      { source: '/portal/knowledge/:path*', destination: '/brain/:path*', permanent: false },
      { source: '/portal/brand-profile', destination: '/brand-profile', permanent: false },
      { source: '/portal/brand-profile/:path*', destination: '/brand-profile/:path*', permanent: false },
      { source: '/portal/brand', destination: '/brand-profile', permanent: false },
      { source: '/portal/brand/:path*', destination: '/brand-profile/:path*', permanent: false },
      { source: '/portal/notes', destination: '/notes', permanent: false },
      { source: '/portal/notes/:path*', destination: '/notes/:path*', permanent: false },
      { source: '/portal/dashboard', destination: '/finder/new', permanent: false },
      // Phase 2 — retire portal-only feature surfaces. Per Jack's intent
      // ("the only difference between the admin and what users see are not
      // admin's or clients really should be the admin sidebar"), viewers
      // share the admin shell's affordances: avatar popover for settings,
      // bell icon for notifications, brand tools in the sidebar. Folding
      // these into separate viewer pages would re-create the divergence
      // we're collapsing. Anything that doesn't belong on a viewer
      // surface either retires entirely or lives on the existing
      // admin-only /admin/* route (which viewers never reach).
      //
      // Settings + preferences — /admin/account is admin-gated, so a viewer
      // bookmark would bounce 2 hops. Land them on the brand home; the
      // avatar popover is the canonical settings entry once they're in the
      // shell.
      { source: '/portal/settings', destination: '/finder/new', permanent: false },
      { source: '/portal/settings/:path*', destination: '/finder/new', permanent: false },
      { source: '/portal/preferences', destination: '/finder/new', permanent: false },
      { source: '/portal/preferences/:path*', destination: '/finder/new', permanent: false },
      // Notifications inbox is the bell button in <AdminTopBar>; deep
      // links into a dedicated route fall back to the brand home.
      { source: '/portal/notifications', destination: '/finder/new', permanent: false },
      { source: '/portal/notifications/:path*', destination: '/finder/new', permanent: false },
      // Content calendar lives at /calendar (admin shell at /admin/calendar);
      // legacy /portal/calendar deep links fall back to the brand home.
      { source: '/portal/calendar', destination: '/finder/new', permanent: false },
      { source: '/portal/calendar/:path*', destination: '/finder/new', permanent: false },
      // Retired per the brand-root migration plan: ideas, nerd, analyze,
      // reports, competitor-tracking. Each redirects to the closest live
      // surface so old links resolve into something useful.
      { source: '/portal/ideas', destination: '/finder/new', permanent: false },
      { source: '/portal/ideas/:path*', destination: '/finder/new', permanent: false },
      { source: '/portal/nerd', destination: '/finder/new', permanent: false },
      { source: '/portal/nerd/:path*', destination: '/finder/new', permanent: false },
      { source: '/portal/analyze', destination: '/finder/new', permanent: false },
      { source: '/portal/analyze/:path*', destination: '/finder/new', permanent: false },
      { source: '/portal/reports', destination: '/finder/new', permanent: false },
      { source: '/portal/reports/:path*', destination: '/finder/new', permanent: false },
      // /spying is admin-only so a viewer bookmark would bounce. Land on
      // brand home like the other retired surfaces.
      { source: '/portal/competitor-tracking', destination: '/finder/new', permanent: false },
      { source: '/portal/competitor-tracking/:path*', destination: '/finder/new', permanent: false },

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
      // Scheduler view consolidated under /admin/calendar (2026-04-27) — same
      // SchedulerContent renders at both URLs, so collapse to one canonical URL.
      // Preserves the ?postId=… query string that opens the post editor on load.
      { source: '/admin/scheduler', destination: '/admin/calendar', permanent: false },
      // Credits → Deliverables directional pivot (2026-05-02). Brand-root
      // /credits and the per-client admin /admin/clients/:slug/credits both
      // collapse onto the new /deliverables surface; client-facing copy is
      // production capacity, never "credits."
      { source: '/credits', destination: '/deliverables', permanent: true },
      { source: '/credits/:path*', destination: '/deliverables/:path*', permanent: true },
      { source: '/admin/clients/:slug/credits', destination: '/admin/clients/:slug/deliverables', permanent: true },
      { source: '/admin/clients/:slug/credits/:path*', destination: '/admin/clients/:slug/deliverables/:path*', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Serve the canonical admin URL from the underlying directory where
      // the directory name still differs from the label. API routes
      // (`/api/scheduler/**`) are intentionally left alone — scheduler
      // provider webhooks hit them by exact URL.
      //
      // /admin/scheduling now has its own directory (team availability picker
      // added 2026-04-26) — no rewrite. /admin/scheduler is the Zernio
      // social-post calendar; the two are distinct surfaces.
      { source: '/admin/edits', destination: '/admin/pipeline' },
      { source: '/admin/edits/:path*', destination: '/admin/pipeline/:path*' },
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
        // Public proposal pages must be embeddable in the admin shell's
        // inline preview iframe. Override the global X-Frame-Options DENY
        // with SAMEORIGIN, and use a CSP frame-ancestors directive that
        // explicitly allows both Cortex hosts (the admin may sit on
        // cortex.nativz.io while previewing a cortex.andersoncollaborative
        // .com proposal, since both are aliases of the same deploy).
        source: '/proposals/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: https://*.mux.com; media-src 'self' blob: https: https://*.mux.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.openrouter.ai https://*.googleapis.com https://*.tikwm.com https://*.apify.com https://*.reddit.com https://*.brave.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://*.mux.com https://*.muxcdn.com wss://*.supabase.co wss://*.mux.com; frame-src https://www.tiktok.com https://www.youtube.com; frame-ancestors 'self' https://cortex.nativz.io https://cortex.andersoncollaborative.com; object-src 'none'; base-uri 'self'" },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: https://*.mux.com; media-src 'self' blob: https: https://*.mux.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.openrouter.ai https://*.googleapis.com https://*.tikwm.com https://*.apify.com https://*.reddit.com https://*.brave.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://*.mux.com https://*.muxcdn.com wss://*.supabase.co wss://*.mux.com; frame-src https://www.tiktok.com https://www.youtube.com; object-src 'none'; base-uri 'self'" },
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
//
// Local-only carve-out: when DISABLE_WORKFLOW_WRAPPER=1, ship the bare
// nextConfig so the dev server doesn't spawn the workflow esbuild process.
// Several local sessions hit a goroutine deadlock in esbuild's background
// service when the wrapper restarts mid-edit; the prod build path still
// goes through `withWorkflow`. Keep this opt-in (default = wrapped).
export default process.env.DISABLE_WORKFLOW_WRAPPER === '1'
  ? nextConfig
  : withWorkflow(nextConfig);
