const TILE_BASE =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg';

/**
 * Shared chrome for every integration row (social + UpPromote): dark frosted tile
 * with a light ring. Colorful marks sit centered inside at ~18px so they match visually.
 */
export const INTEGRATION_SOCIAL_ICON_TILE = `${TILE_BASE} bg-black/65 ring-1 ring-white/12`;
