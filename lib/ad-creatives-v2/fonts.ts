// ---------------------------------------------------------------------------
// Ad Creatives v2 — Font Registration
// ---------------------------------------------------------------------------
//
// Three sources of fonts in v2:
//   1. Packaged fonts — Montserrat + Playfair Display from @fontsource.
//      Registered once at module init, available to every render.
//   2. Per-client brand fonts — rows in brand_fonts. Files live in Supabase
//      Storage (bucket `brand-fonts`). Downloaded to /tmp on first use and
//      registered with @napi-rs/canvas GlobalFonts.
//   3. (future) Shared fonts library — fonts uploaded at the org level.

import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createAdminClient } from "@/lib/supabase/admin";

// createRequire gives us node-style resolution that works in both CJS and
// ESM contexts, and (importantly) doesn't trip the webpack static
// analyzer the way `new URL(".", import.meta.url)` does. Webpack was
// parsing that URL call and trying to resolve "." as a module.
const requireFromHere = createRequire(import.meta.url);

const PACKAGED_MONTSERRAT_PKG = "@fontsource/montserrat/files";
const PACKAGED_PLAYFAIR_PKG = "@fontsource/playfair-display/files";
const PACKAGED_ARCHIVO_BLACK_PKG = "@fontsource/archivo-black/files";

const TMP_FONT_DIR = "/tmp/ad-creatives-v2-fonts";

let packagedRegistered = false;
/** Which per-client font paths have already been registered this process. */
const registeredClientFonts = new Set<string>();

/** Register the packaged Montserrat + Playfair Display. Idempotent. */
export function registerPackagedFonts(): void {
  if (packagedRegistered) return;

  // Montserrat
  const montDir = resolvePackageDir(PACKAGED_MONTSERRAT_PKG);
  const montFiles = readdirSync(montDir).filter(
    (f) => f.endsWith(".woff") && f.startsWith("montserrat-latin-"),
  );
  for (const file of montFiles) {
    const match = file.match(/^montserrat-latin-(\d{3})-(normal|italic)\.woff$/);
    if (!match) continue;
    const weight = parseInt(match[1], 10);
    const italic = match[2] === "italic";
    GlobalFonts.registerFromPath(
      join(montDir, file),
      buildFontAlias("Montserrat", weight, italic),
    );
  }

  // Playfair Display
  const playfairDir = resolvePackageDir(PACKAGED_PLAYFAIR_PKG);
  const playfairFiles = readdirSync(playfairDir).filter(
    (f) => f.endsWith(".woff") && f.startsWith("playfair-display-latin-"),
  );
  for (const file of playfairFiles) {
    const match = file.match(/^playfair-display-latin-(\d{3})-(normal|italic)\.woff$/);
    if (!match) continue;
    const weight = parseInt(match[1], 10);
    const italic = match[2] === "italic";
    GlobalFonts.registerFromPath(
      join(playfairDir, file),
      buildFontAlias("PlayfairDisplay", weight, italic),
    );
  }

  // Archivo Black (Crystal Creek display face — chunky slab-sans, single weight 900)
  const archivoDir = resolvePackageDir(PACKAGED_ARCHIVO_BLACK_PKG);
  const archivoFiles = readdirSync(archivoDir).filter(
    (f) => f.endsWith(".woff") && f.startsWith("archivo-black-latin-"),
  );
  for (const file of archivoFiles) {
    const match = file.match(/^archivo-black-latin-(\d{3})-(normal|italic)\.woff$/);
    if (!match) continue;
    const weight = parseInt(match[1], 10);
    const italic = match[2] === "italic";
    GlobalFonts.registerFromPath(
      join(archivoDir, file),
      buildFontAlias("ArchivoBlack", weight, italic),
    );
  }

  packagedRegistered = true;
}

/** ctx.font value for Archivo Black (Crystal Creek display — 900-only). */
export function archivoBlackFont(sizePx: number): string {
  return fontString("ArchivoBlack", sizePx, { weight: 900 });
}

/** Download + register all brand_fonts rows for a client. Idempotent. */
export async function registerClientBrandFonts(clientId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("brand_fonts")
    .select("family_alias, weight, italic, storage_path, font_format")
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`Failed to load brand_fonts for ${clientId}: ${error.message}`);
  }
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const alias = buildFontAlias(row.family_alias as string, row.weight as number, row.italic as boolean);
    if (registeredClientFonts.has(alias)) continue;

    const localPath = join(TMP_FONT_DIR, clientId, `${alias}.${row.font_format}`);
    if (!existsSync(localPath)) {
      mkdirSync(dirname(localPath), { recursive: true });
      const { data: fileBlob, error: downloadError } = await admin.storage
        .from("brand-fonts")
        .download(row.storage_path as string);
      if (downloadError || !fileBlob) {
        throw new Error(
          `Failed to download font ${row.storage_path}: ${downloadError?.message ?? "no data"}`,
        );
      }
      const buf = Buffer.from(await fileBlob.arrayBuffer());
      writeFileSync(localPath, buf);
    }

    GlobalFonts.registerFromPath(localPath, alias);
    registeredClientFonts.add(alias);
  }
}

// ---------------------------------------------------------------------------
// ctx.font helpers
// ---------------------------------------------------------------------------

export function playfairFont(
  sizePx: number,
  opts: { weight?: 400 | 500 | 700 | 900; italic?: boolean } = {},
): string {
  return fontString("PlayfairDisplay", sizePx, opts);
}

export function montFont(
  sizePx: number,
  opts: { weight?: 400 | 500 | 700 | 900; italic?: boolean } = {},
): string {
  return fontString("Montserrat", sizePx, opts);
}

export function boraxFont(
  sizePx: number,
  opts: { weight?: 400 | 500 | 700 | 900; italic?: boolean } = {},
): string {
  return fontString("Borax", sizePx, opts);
}

export function fontString(
  family: string,
  sizePx: number,
  opts: { weight?: number; italic?: boolean } = {},
): string {
  const weight = opts.weight ?? 500;
  const suffix = opts.italic ? "-italic" : "";
  return `${sizePx}px "${family}-${weight}${suffix}"`;
}

function buildFontAlias(family: string, weight: number, italic: boolean): string {
  return `${family}-${weight}${italic ? "-italic" : ""}`;
}

function resolvePackageDir(pkg: string): string {
  // pkg format examples:
  //   "@fontsource/montserrat/files"         → package "@fontsource/montserrat", subdir "files"
  //   "@fontsource/playfair-display/files"   → package "@fontsource/playfair-display", subdir "files"
  const parts = pkg.split("/");
  const packageName = parts[0].startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  const subPath = parts.slice(packageName.split("/").length).join("/");

  // Resolve the package's package.json via Node's module resolver, which
  // handles hoisting, workspaces, and Vercel's bundled layout without
  // hardcoded node_modules lookups. Fall back to cwd on failure so the
  // function still works in contexts where resolution is constrained.
  try {
    const pkgJsonPath = requireFromHere.resolve(`${packageName}/package.json`);
    const pkgRoot = dirname(pkgJsonPath);
    return subPath ? join(pkgRoot, subPath) : pkgRoot;
  } catch {
    const fallback = join(process.cwd(), "node_modules", pkg);
    if (existsSync(fallback)) return fallback;
    throw new Error(`Could not locate ${pkg}`);
  }
}
