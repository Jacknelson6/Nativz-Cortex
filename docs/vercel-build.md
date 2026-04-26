# Vercel build cache

Read when a Vercel deploy fails with webpack errors after a large dependency or route-graph change.

## Current setting

`vercel.json` sets `VERCEL_FORCE_NO_BUILD_CACHE=1` during build. Vercel will not restore a stale remote cache.

## Why

A stale remote build cache can crash webpack with `Cannot read properties of undefined (reading 'length')` after large dependency or route-graph changes.

**Tradeoff:** slightly longer builds.

## Re-enabling caching after a stable period

1. Remove the `build.env` `VERCEL_FORCE_NO_BUILD_CACHE` entry from `vercel.json`.
2. If a one-off clean build is needed, use **Redeploy** → uncheck "Use existing Build Cache".
