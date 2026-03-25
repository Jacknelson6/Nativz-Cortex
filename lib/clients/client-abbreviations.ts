/**
 * Internal short labels for client names in dense UI (e.g. search result headers).
 * Keys are normalized with {@link normalizeClientNameKey}.
 */
const ABBREVIATION_BY_CLIENT_NAME: Record<string, string> = {
  'all shutters and blinds': 'ASAB',
  'avondale private lending': 'APL',
  'crystal creek cattle': 'CCC',
  'custom shade and shutter': 'CSS',
  ecoview: 'EV',
  'goodier labs': 'GL',
  'rank prompt': 'RP',
  kumon: 'KM',
  'weston funding': 'WF',
  "dunston's steakhouse": 'DSH',
  'fusion brands': 'FB',
  'hartley law': 'HL',
  'skibell fine jewelry': 'SFJ',
  'the standard ranch water': 'TSRW',
  'total plumbing': 'TP',
  'varsity vault': 'VV',
  'stealth health life': 'SHL',
  goldback: 'GB',
  toastique: 'TQ',
  'safe stop': 'SS',
  'stealth health containers': 'SHC',
  'coast to coast': 'CTC',
  'owings auto': 'OA',
  'landshark vodka seltzer': 'LSVS',
  'equidad homes': 'EH',
  'rana furniture': 'RF',
  'college hunks hauling junk': 'CHHJ',
};

/** When the DB slug is stable but the display name varies slightly. */
const ABBREVIATION_BY_CLIENT_SLUG: Record<string, string> = {
  goldback: 'GB',
  ecoview: 'EV',
  toastique: 'TQ',
  'safe-stop': 'SS',
  'rank-prompt': 'RP',
  kumon: 'KM',
  'college-hunks-hauling-junk': 'CHHJ',
};

export function normalizeClientNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Returns the admin-approved abbreviation when known; otherwise the full name.
 */
export function getClientAbbreviationLabel(name: string, slug?: string | null): string {
  const byName = ABBREVIATION_BY_CLIENT_NAME[normalizeClientNameKey(name)];
  if (byName) return byName;
  const s = slug?.trim().toLowerCase();
  if (s && ABBREVIATION_BY_CLIENT_SLUG[s]) return ABBREVIATION_BY_CLIENT_SLUG[s];
  return name;
}

/** Shared Tailwind classes: search query title in header — wrap relatively early. */
export const searchHeaderQueryClassName =
  'font-medium text-text-primary break-words [overflow-wrap:anywhere] max-w-[min(100%,14rem)] sm:max-w-[min(100%,18rem)]';

/** Client segment next to query — short abbrev rarely needs width cap; full name wraps sooner. */
export const searchHeaderClientClassName =
  'break-words [overflow-wrap:anywhere] max-w-[min(100%,10rem)] sm:max-w-[min(100%,12rem)]';
