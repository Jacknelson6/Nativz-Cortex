/**
 * Template renderer for self-hosted proposal pages.
 *
 * Cortex serves the AC content-editing-packages HTML (originally hosted at
 * docs.andersoncollaborative.com) directly under cortex.andersoncollaborative.com
 * /proposals/<slug>. The HTML is checked in under
 * lib/proposals/templates/<template-folder>/{index,sign}.html.
 *
 * At request time we rewrite three classes of references in the original HTML:
 *
 *   1. Asset paths   (`../_shared/foo`, `assets/foo`, `/_shared/foo`,
 *                     `/assets/foo`) → `/proposal-assets/<agency>/...`
 *      so they hit Cortex's static `public/proposal-assets/` tree.
 *   2. Sign-page link target on the landing page (the three "Get Started"
 *      buttons) → `/proposals/<slug>/sign?tier=...`.
 *   3. JS hooks on the sign page that originally fetched `/<slug>/client.json`
 *      and POSTed to `/api/sign` → Cortex's `/api/proposals/public/<slug>/...`
 *      endpoints. We also inject the slug as a constant so we don't depend on
 *      the original `location.pathname.split(...)` heuristic.
 *
 * The original HTML, CSS, and brand chrome are otherwise untouched.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type TemplateFolder = 'anderson-content-editing';

const TEMPLATE_ROOT = path.join(process.cwd(), 'lib/proposals/templates');

const cache = new Map<string, string>();

async function loadRaw(folder: TemplateFolder, file: 'index.html' | 'sign.html'): Promise<string> {
  const cacheKey = `${folder}:${file}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const full = path.join(TEMPLATE_ROOT, folder, file);
  const raw = await readFile(full, 'utf-8');
  cache.set(cacheKey, raw);
  return raw;
}

function rewriteAssets(html: string, agency: 'anderson' | 'nativz', sourceFolder: string): string {
  const assetBase = `/proposal-assets/${agency}`;
  return (
    html
      // landing page: `../_shared/foo` → `/proposal-assets/<agency>/_shared/foo`
      .replaceAll('../_shared/', `${assetBase}/_shared/`)
      // landing page: `assets/foo` (relative) → `/proposal-assets/<agency>/<source-folder>/assets/foo`
      // Anchor only when prefixed by `="` or `='` to avoid hitting JS strings or CSS that we don't intend.
      .replaceAll('="assets/', `="${assetBase}/${sourceFolder}/assets/`)
      .replaceAll("='assets/", `='${assetBase}/${sourceFolder}/assets/`)
      // sign page: `/_shared/foo` (root-relative) → `/proposal-assets/<agency>/_shared/foo`
      .replaceAll('"/_shared/', `"${assetBase}/_shared/`)
      .replaceAll("'/_shared/", `'${assetBase}/_shared/`)
      // sign page: `/assets/foo` (root-relative) → `/proposal-assets/<agency>/<source-folder>/assets/foo`
      .replaceAll('"/assets/', `"${assetBase}/${sourceFolder}/assets/`)
      .replaceAll("'/assets/", `'${assetBase}/${sourceFolder}/assets/`)
  );
}

export async function renderProposalLandingHtml(opts: {
  templateFolder: TemplateFolder;
  agency: 'anderson' | 'nativz';
  sourceFolder: string; // e.g. 'content-editing-packages'
  slug: string;
}): Promise<string> {
  const raw = await loadRaw(opts.templateFolder, 'index.html');
  let html = rewriteAssets(raw, opts.agency, opts.sourceFolder);

  // Sign-button links: original is `/<source-folder>/sign/?tier=…`.
  html = html.replaceAll(
    `/${opts.sourceFolder}/sign/?tier=`,
    `/proposals/${opts.slug}/sign?tier=`,
  );
  // Defensive: if the template ever ships with `sign/?tier=` (relative form).
  html = html.replaceAll('href="sign/?tier=', `href="/proposals/${opts.slug}/sign?tier=`);

  return html;
}

export async function renderSignPageHtml(opts: {
  templateFolder: TemplateFolder;
  agency: 'anderson' | 'nativz';
  sourceFolder: string;
  slug: string;
}): Promise<string> {
  const raw = await loadRaw(opts.templateFolder, 'sign.html');
  let html = rewriteAssets(raw, opts.agency, opts.sourceFolder);

  // 1. Replace the slug-extraction heuristic with a server-injected constant.
  //    The original line is:
  //      slug: location.pathname.split('/').filter(Boolean)[0] || '',
  html = html.replace(
    /slug:\s*location\.pathname\.split\([^)]+\)\.filter\(Boolean\)\[0\]\s*\|\|\s*''/,
    `slug: ${JSON.stringify(opts.slug)}`,
  );

  // 2. Rewrite the client.json fetch target to Cortex's config endpoint.
  //    Original: fetch('/' + slug + '/client.json', { cache: 'no-store' })
  html = html.replace(
    /fetch\('\/'\s*\+\s*slug\s*\+\s*'\/client\.json'/,
    `fetch('/api/proposals/public/' + slug + '/config'`,
  );

  // 3. Rewrite the sign POST target.
  html = html.replaceAll(
    `fetch('/api/sign'`,
    `fetch('/api/proposals/public/' + proposalConfig.slug + '/sign'`,
  );

  return html;
}
