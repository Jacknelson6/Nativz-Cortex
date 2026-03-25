import { getNanoBananaBySlug } from './catalog';

/**
 * Matches `scripts/nano-banana-goldback-gemini-batch.ts`: slot-level style hint from the
 * catalog’s second line (layout / composition intent) so the model gets the same
 * per-template anchor the CLI batch used.
 */
export function nanoBananaCatalogStyleDirection(slug: string): string | undefined {
  const nano = getNanoBananaBySlug(slug);
  if (!nano) return undefined;
  const line = nano.promptTemplate.split('\n')[1] ?? '';
  if (!line.trim()) return undefined;
  return `Nano Banana style #${nano.sortOrder} (${nano.name}): ${line}`.slice(0, 2000);
}
