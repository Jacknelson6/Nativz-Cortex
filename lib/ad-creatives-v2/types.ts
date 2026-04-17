// ---------------------------------------------------------------------------
// Ad Creatives v2 — Core Types
// ---------------------------------------------------------------------------
//
// Compositor-first pipeline. See morning-ads/CORTEX-MIGRATION-PRD.md.
// v2 runs alongside v1 (lib/ad-creatives/). Do not import across the boundary.

/** Brand color pair supporting any hex string — resolved per-client at compose time. */
export interface BrandPalette {
  primary: string;
  accent: string;
  onPrimary: string; // text color when rendered on `primary`
  onAccent: string; // text color when rendered on `accent`
  ivory?: string;
  charcoal?: string;
  [key: string]: string | undefined;
}

/** A single span inside a headline — enables italics + color emphasis per brand spec. */
export interface HeadlineSpan {
  text: string;
  italic?: boolean;
  /** Palette key (e.g. 'accent', 'primary', 'ivory'). Resolved to hex at render time. */
  color?: keyof BrandPalette;
  /** Forces this span to start on a new line. */
  newline?: boolean;
}

/** Canvas aspect. 1:1 is Meta feed native. */
export type Aspect = "1:1" | "4:5" | "9:16";

/** Which source provides the hero image, if any. */
export type PhotoSource = "product" | "scene" | "none";

/** Anchor used by the logo compositor. */
export type LogoAnchor =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "center";

export interface BrandLogoVariant {
  /** Stable key used by layouts (e.g. 'white-full', 'navy-full', 'gold-white'). */
  colorway: string;
  /** Supabase Storage path — bucket inferred by the caller. */
  storagePath: string;
}

export interface BrandFontAlias {
  /** e.g. 'Borax', 'PlayfairDisplay', 'Montserrat' */
  family: string;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  italic: boolean;
}

/**
 * Everything the compositor needs about a client at render time. Assembled
 * from brand DNA + brand_fonts + brand_scene_photos + brand_product_photos.
 */
export interface BrandRenderContext {
  clientId: string;
  clientName: string;
  palette: BrandPalette;
  /** Logo PNG buffers keyed by colorway, pre-fetched from storage. */
  logos: Record<string, Buffer>;
  /** Registered font aliases (already registered with GlobalFonts). */
  fonts: BrandFontAlias[];
  /** Optional primary font family name used by the template (falls back to brand default). */
  primaryDisplayFamily?: string;
  /** Optional secondary font family name for body/UI. */
  secondaryFamily?: string;
}

/** A single concept to render. */
export interface ConceptSpec {
  clientId: string;
  /** Maps to brand_ad_templates.layout_slug. */
  layoutSlug: string;
  aspect: Aspect;
  headline: string | HeadlineSpan[];
  subhead?: string;
  /** Small UPPERCASE call-out above headline ("FIX AND FLIP", "FAST APPROVALS"). */
  eyebrow?: string;
  /** Optional CTA text (some layouts use it, most don't — Meta renders the real button). */
  cta?: string;
  /** Photo source + id (references brand_product_photos or brand_scene_photos). */
  photoSource: PhotoSource;
  /** Storage path to the photo if photoSource !== 'none'. */
  photoStoragePath?: string;
  /** Which logo colorway to composite (must exist in BrandRenderContext.logos). */
  logoColorway: string;
  /** Optional background treatment ('dark', 'light', 'navy', 'ivory', etc.) — layout-specific. */
  background?: string;
}

/** Result of a render — the PNG buffer + some metadata. */
export interface RenderResult {
  pngBuffer: Buffer;
  width: number;
  height: number;
  layoutSlug: string;
  renderedAt: string;
}
