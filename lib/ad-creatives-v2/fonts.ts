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
import { createAdminClient } from "@/lib/supabase/admin";

const PACKAGED_MONTSERRAT_PKG = "@fontsource/montserrat/files";
const PACKAGED_PLAYFAIR_PKG = "@fontsource/playfair-display/files";

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

  packagedRegistered = true;
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
  const here = new URL(".", import.meta.url).pathname;
  const candidates = [
    join(process.cwd(), "node_modules", pkg),
    join(here, "..", "..", "node_modules", pkg),
    join(here, "..", "..", "..", "node_modules", pkg),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`Could not locate ${pkg}. Tried: ${candidates.join(", ")}`);
}
